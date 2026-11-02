#!/usr/bin/env bash

# 备份、发布、恢复共用的函数库；source 只加载函数，不会自动备份或迁移。
# 调用入口持有文件描述符 9 的发布锁，整个流程不重复加锁；服务器无需安装 Node。
# 以下路径是脚本内固定常量，不是通过 export 传入的备份环境变量。
readonly MES_STACK_DIR='/opt/easy-mes'
# 已完成备份目录的父目录；每次备份再生成带时间和唯一后缀的子目录。
readonly MES_BACKUP_DIR='/srv/easy-mes/backups/mysql'
# 维护标记跨进程退出保留，记录原服务状态；文件存在不等于已完成备份。
readonly MES_MAINTENANCE_FILE="${MES_STACK_DIR}/mysql-maintenance.state"
readonly MES_LOCK_FILE='/run/lock/easy-mes-deploy.lock'
MES_COMPOSE_ENV="${MES_STACK_DIR}/release.env"
# 单次命令上限；备份另有 20 分钟总时限，调用处可为短操作临时缩小。
MES_COMMAND_TIMEOUT=900

mes_log() { printf '[%s] %s\n' "$(date --iso-8601=seconds)" "$*"; }
mes_fail() { mes_log "ERROR: $*" >&2; exit 1; }

mes_require_file() {
  local file="$1" secret="${2:-false}" mode
  [[ -f "${file}" && ! -L "${file}" && -s "${file}" ]] || mes_fail "required regular file is missing: ${file}"
  [[ "$(stat -c '%u' -- "${file}")" == 0 ]] || mes_fail "file must be owned by root: ${file}"
  mode="$(stat -c '%a' -- "${file}")"
  (( (8#${mode} & 022) == 0 )) || mes_fail "file must not be writable by group or others: ${file}"
  if [[ "${secret}" == true ]]; then
    (( (8#${mode} & 077) == 0 )) || mes_fail "file must only be accessible by root: ${file}"
  fi
}

mes_require_runtime() {
  local command file
  [[ "${EUID}" == 0 ]] || mes_fail 'this maintenance entry point must run as root'
  for command in awk cmp date docker flock gzip install mktemp sha256sum sort stat timeout; do
    command -v "${command}" >/dev/null 2>&1 || mes_fail "required command is missing: ${command}"
  done
  mes_require_file "${MES_STACK_DIR}/compose.prod.yml"
  for file in deploy.env api.env mysql.env minio.env minio.license; do
    mes_require_file "/etc/easy-mes/${file}" true
  done
  if [[ -e "${MES_COMPOSE_ENV}" ]]; then mes_require_file "${MES_COMPOSE_ENV}" true; fi
}

mes_take_lock() {
  # 宿主机互斥锁防止发布、备份、恢复并发；它本身不会阻止外部 SQL 写入。
  exec 9>"${MES_LOCK_FILE}"
  flock -n 9 || mes_fail 'another easy-mes deployment or maintenance task is running'
}

mes_compose() {
  local command_timeout="${MES_COMMAND_TIMEOUT}" remaining
  if [[ "${MES_BACKUP_DEADLINE_EPOCH:-0}" -gt 0 ]]; then
    remaining=$(( MES_BACKUP_DEADLINE_EPOCH - $(date +%s) ))
    (( remaining > 0 )) || mes_fail 'database maintenance exceeded its 20-minute deadline'
    if (( remaining < command_timeout )); then command_timeout="${remaining}"; fi
  fi
  # deploy.env 负责仓库/端口等 Compose 配置；MES_COMPOSE_ENV 选择正式或候选镜像。
  # api.env / mysql.env 等容器变量由 compose.prod.yml 中的 env_file 加载。
  local -a args=(--project-name easy-mes --env-file /etc/easy-mes/deploy.env)
  if [[ -s "${MES_COMPOSE_ENV}" ]]; then args+=(--env-file "${MES_COMPOSE_ENV}"); fi
  timeout --foreground --signal=TERM --kill-after=10s "${command_timeout}s" \
    docker compose "${args[@]}" --file "${MES_STACK_DIR}/compose.prod.yml" "$@"
}

# 在现有 MySQL 容器内读取 MYSQL_ROOT_PASSWORD，写入临时 600 客户端配置，退出删除。
# 备份/恢复走容器内 socket；密码不进入宿主机命令参数或日志，也不使用 API 的 DB_PASSWORD。
mes_mysql_program() {
  local program="$1"
  shift
  mes_compose exec -T mysql bash -ceu '
    umask 077
    option_file=$(mktemp /tmp/easy-mes-client.XXXXXX)
    trap '\''rm -f -- "$option_file"'\'' EXIT
    password=${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}
    password=${password//\\/\\\\}
    password=${password//\"/\\\"}
    password=${password//$'\''\n'\''/\\n}
    password=${password//$'\''\r'\''/\\r}
    password=${password//$'\''\t'\''/\\t}
    printf '\''[client]\nuser=root\npassword="%s"\nprotocol=socket\n'\'' "$password" > "$option_file"
    unset password MYSQL_ROOT_PASSWORD
    program=$1
    shift
    "$program" --defaults-extra-file="$option_file" "$@"
  ' easy-mes-client "${program}" "$@"
}

mes_mysql() {
  mes_mysql_program mysql --batch --skip-column-names --default-character-set=utf8mb4 \
    --connect-timeout=10 --skip-reconnect "$@"
}

mes_current_image() {
  local image_key="${1:-API_IMAGE}"
  if [[ -s "${MES_STACK_DIR}/release.env" ]]; then
    awk -F= -v wanted="${image_key}" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' "${MES_STACK_DIR}/release.env"
  fi
}

mes_source_database() {
  local database host port
  # api.env 的 DB_NAME 决定当前业务库；DB_HOST / DB_PORT 限定为本 Compose 的 mysql:3306。
  # MYSQL_DATABASE 只用于首次初始化，切库后容器内的旧值不能作为备份源库。
  host="$(mes_connection_value DB_HOST)"
  port="$(mes_connection_value DB_PORT)"
  database="$(mes_connection_value DB_NAME)"
  [[ "${host}" == mysql && "${port}" == 3306 ]] || mes_fail 'backup/restore only supports api.env DB_HOST=mysql and DB_PORT=3306'
  [[ "${database}" =~ ^[A-Za-z0-9_]{1,64}$ ]] || mes_fail 'DB_NAME must use 1-64 ASCII letters, digits or underscores'
  case "${database}" in mysql|sys|information_schema|performance_schema) mes_fail 'system databases are not backup targets';; esac
  printf '%s\n' "${database}"
}

mes_connection_value() {
  # 把 api.env 当文本读取，不 source 执行；连接定位值必须是明确字面值。
  local value
  value="$(awk -v wanted="$1" '
    /^[[:space:]]*(#|$)/ { next }
    {
      separator=index($0,"=")
      name=substr($0,1,separator-1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (separator && name == wanted) {
        count++
        value=substr($0,separator+1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      }
    }
    END { if (count != 1) exit 1; print value }
  ' /etc/easy-mes/api.env)" || mes_fail "api.env requires exactly one ${1}"
  if [[ "${value}" == \"*\" || "${value}" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  [[ "${value}" =~ ^[A-Za-z0-9_]+$ ]] || mes_fail "api.env ${1} must be a literal value without interpolation"
  printf '%s\n' "${value}"
}

mes_begin_maintenance() {
  local reason="$1" target="${2:-}" temporary resume_web=stopped resume_api=stopped
  # 失败后再次进入仍保留最初的运行状态，避免把暂时停机误认为原来就没有启动。
  if [[ -e "${MES_MAINTENANCE_FILE}" ]]; then
    mes_require_file "${MES_MAINTENANCE_FILE}" true
    resume_web="$(awk -F= '$1 == "resume_web" {print $2; exit}' "${MES_MAINTENANCE_FILE}")"
    resume_api="$(awk -F= '$1 == "resume_api" {print $2; exit}' "${MES_MAINTENANCE_FILE}")"
  else
    [[ -z "$(mes_compose ps --status running --quiet web)" ]] || resume_web=running
    [[ -z "$(mes_compose ps --status running --quiet api)" ]] || resume_api=running
  fi
  [[ "${resume_web}" =~ ^(running|stopped)$ && "${resume_api}" =~ ^(running|stopped)$ ]] || mes_fail 'maintenance state has invalid service state'
  temporary="$(mktemp "${MES_STACK_DIR}/.maintenance.XXXXXX")"
  printf 'started_at=%s\nreason=%s\ncurrent_api_image=%s\ntarget_api_image=%s\nresume_api=%s\nresume_web=%s\n' \
    "$(date --iso-8601=seconds)" "${reason}" "$(mes_current_image)" "${target}" "${resume_api}" "${resume_web}" >"${temporary}"
  chown root:root "${temporary}"
  chmod 600 "${temporary}"
  mv -f -- "${temporary}" "${MES_MAINTENANCE_FILE}"
}

mes_refuse_maintenance() {
  [[ ! -e "${MES_MAINTENANCE_FILE}" ]] || mes_fail \
    'database maintenance is active; inspect mysql-maintenance.state and use the documented manual recovery entry point'
}

mes_stop_api() {
  # API 没有宿主机端口；同时停止 Web 入口，避免候选 API 在验证期间接收业务请求。
  mes_log 'Stopping Web ingress and the API before database maintenance.'
  mes_compose stop --timeout 60 web api
  [[ -z "$(mes_compose ps --status running --quiet web)" ]] || mes_fail 'Web ingress is still running; maintenance cannot continue'
  [[ -z "$(mes_compose ps --status running --quiet api)" ]] || mes_fail 'API is still running; maintenance cannot continue'
}

mes_restore_web() {
  if [[ "$(awk -F= '$1 == "resume_web" {print $2; exit}' "${MES_MAINTENANCE_FILE}")" == running ]]; then
    mes_log 'Restoring the Web ingress that was running before maintenance.'
    mes_compose up -d --no-deps --wait web
  fi
}

mes_wait_api_ready() {
  local attempt
  for ((attempt=1; attempt<=30; attempt+=1)); do
    if MES_COMMAND_TIMEOUT=10 mes_compose exec -T api node -e \
      "fetch('http://127.0.0.1:' + process.env.APP_PORT + '/api/health/ready', { signal: AbortSignal.timeout(5000) }).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# 自动记录对象定义摘要和逐表行数，供这份备份恢复后核验；无需手工维护快照。
# 触发器执行顺序、创建时 SQL_MODE 和字符集也参与核验；业务数据只放在 dump 中。
mes_write_inventory() {
  local database="$1" directory="$2" table count
  mes_mysql --execute="
    SELECT 'table', TABLE_NAME, TABLE_TYPE, COALESCE(ENGINE,''), COALESCE(TABLE_COLLATION,'')
      FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}'
    UNION ALL SELECT 'column', CONCAT(TABLE_NAME,'.',COLUMN_NAME), CAST(ORDINAL_POSITION AS CHAR), COLUMN_TYPE,
      CONCAT(IS_NULLABLE,'|',COALESCE(HEX(COLUMN_DEFAULT),'NULL'),'|',EXTRA,'|',COALESCE(COLLATION_NAME,''),'|',GENERATION_EXPRESSION)
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${database}'
    UNION ALL SELECT 'index', CONCAT(TABLE_NAME,'.',INDEX_NAME), CAST(SEQ_IN_INDEX AS CHAR), CAST(NON_UNIQUE AS CHAR),
      CONCAT(COALESCE(COLUMN_NAME,''),'|',COALESCE(CAST(SUB_PART AS CHAR),''),'|',INDEX_TYPE,'|',COALESCE(EXPRESSION,''))
      FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${database}'
    UNION ALL SELECT 'constraint', CONCAT(TABLE_NAME,'.',CONSTRAINT_NAME), CONSTRAINT_TYPE, '', ''
      FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${database}'
    UNION ALL SELECT 'constraint-column', CONCAT(TABLE_NAME,'.',CONSTRAINT_NAME), CAST(ORDINAL_POSITION AS CHAR), COLUMN_NAME,
      CONCAT(COALESCE(IF(REFERENCED_TABLE_SCHEMA='${database}','self',REFERENCED_TABLE_SCHEMA),''),'|',COALESCE(REFERENCED_TABLE_NAME,''),'|',COALESCE(REFERENCED_COLUMN_NAME,''))
      FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA='${database}'
    UNION ALL SELECT 'check', CONSTRAINT_NAME, '', '', SHA2(CHECK_CLAUSE,256)
      FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${database}'
    UNION ALL SELECT 'trigger', TRIGGER_NAME, EVENT_OBJECT_TABLE,
      CONCAT(ACTION_TIMING,':',EVENT_MANIPULATION,':',ACTION_ORDER),
      CONCAT(SQL_MODE,'|',CHARACTER_SET_CLIENT,'|',COLLATION_CONNECTION,'|',DATABASE_COLLATION,'|',SHA2(ACTION_STATEMENT,256))
      FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${database}'
    UNION ALL SELECT 'routine', ROUTINE_NAME, ROUTINE_TYPE, SQL_MODE,
      CONCAT(CHARACTER_SET_CLIENT,'|',COLLATION_CONNECTION,'|',DATABASE_COLLATION,'|',SHA2(ROUTINE_DEFINITION,256))
      FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='${database}'
    UNION ALL SELECT 'event', EVENT_NAME, STATUS, SQL_MODE,
      CONCAT(CHARACTER_SET_CLIENT,'|',COLLATION_CONNECTION,'|',DATABASE_COLLATION,'|',SHA2(EVENT_DEFINITION,256))
      FROM information_schema.EVENTS WHERE EVENT_SCHEMA='${database}';
  " | LC_ALL=C sort >"${directory}/objects.tsv"
  mes_mysql --execute="SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME" \
    >"${directory}/tables.txt"
  : >"${directory}/rows.tsv"
  while IFS= read -r table; do
    [[ "${table}" =~ ^[A-Za-z0-9_\$]+$ ]] || mes_fail 'table name is outside the supported project naming convention'
    count="$(mes_mysql --database="${database}" --execute="SELECT COUNT(*) FROM \`${table}\`")"
    [[ "${count}" =~ ^[0-9]+$ ]] || mes_fail 'invalid row count returned by MySQL'
    printf '%s\t%s\n' "${table}" "${count}" >>"${directory}/rows.tsv"
  done <"${directory}/tables.txt"
  rm -f -- "${directory}/tables.txt"
}

# 子 shell 负责释放 MySQL 读锁、清理未完成文件；调用者的宿主机发布锁始终保留。
# mode / target 是函数参数；final_name 是本次完成目录，只写入日志，不导出到父 shell。
mes_create_backup() (
  set -Eeuo pipefail
  local mode="$1" target="${2:-}" database work='' lock_pid='' lock_id='' lock_in='' lock_out=''
  local ready version charset collation started_at api_was_running=false final_name original_in original_out
  local backup_finished=false
  local maintenance_started=false
  local MES_BACKUP_DEADLINE_EPOCH=$(( $(date +%s) + 1200 ))
  cleanup_backup() {
    local status="$?"
    trap - EXIT INT TERM
    # 异常时也尽力释放数据库读锁；完整备份保留，隐藏的未完成目录清理。
    if [[ -n "${lock_id}" ]]; then
      MES_BACKUP_DEADLINE_EPOCH=0 MES_COMMAND_TIMEOUT=20 mes_mysql --execute="KILL CONNECTION ${lock_id}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${lock_in}" ]]; then exec {lock_in}>&-; fi
    if [[ -n "${lock_out}" ]]; then exec {lock_out}<&-; fi
    if [[ -n "${lock_pid}" ]]; then kill "${lock_pid}" 2>/dev/null || true; wait "${lock_pid}" 2>/dev/null || true; fi
    if [[ -n "${work}" && -d "${work}" ]]; then rm -rf --one-file-system -- "${work}"; fi
    if [[ "${status}" != 0 && "${maintenance_started}" == true ]]; then
      MES_BACKUP_DEADLINE_EPOCH=0 MES_COMMAND_TIMEOUT=80 mes_compose stop --timeout 60 web api >/dev/null 2>&1 || \
        mes_log 'CRITICAL: stopping services failed; isolate traffic before recovery.' >&2
    fi
    if [[ "${backup_finished}" != true && "${maintenance_started}" == true ]]; then
      mes_log 'Backup failed. Web ingress and the API remain stopped; maintenance requires manual review.' >&2
    fi
    exit "${status}"
  }
  trap cleanup_backup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  case "${mode}" in manual|scheduled) mes_refuse_maintenance;; release) ;; *) mes_fail 'invalid backup mode';; esac
  mes_require_runtime
  install -d -o root -g root -m 700 "${MES_BACKUP_DIR}"
  work="$(mktemp -d "${MES_BACKUP_DIR}/.incomplete.XXXXXX")"
  # 导出前核对源库存在；API 在运行时还核对其实际连接库与 api.env 一致。
  database="$(mes_source_database)"
  [[ "$(mes_mysql --execute="SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${database}'" 2>"${work}/diagnostic.log")" == 1 ]] || \
    mes_fail 'configured source database does not exist or cannot be inspected'
  [[ -z "$(mes_compose ps --status running --quiet api)" ]] || api_was_running=true
  if [[ "${api_was_running}" == true ]]; then
    [[ "$(mes_compose exec -T api sh -ceu 'printf "%s:%s:%s\n" "$DB_HOST" "$DB_PORT" "$DB_NAME"')" == "mysql:3306:${database}" ]] || \
      mes_fail 'running API database configuration differs from api.env; stop writes and review the intended database before backup'
  fi
  mes_begin_maintenance "${mode}-backup" "${target}"
  maintenance_started=true
  mes_stop_api

  # 独立 MySQL 会话持续持有全局读锁，导出和核对期间阻止写入及 DDL。
  # 禁止断线重连；未拿到锁、失锁或超时都使本次备份失败，不能发布完成目录。
  coproc MES_DB_LOCK { mes_mysql --unbuffered 2>"${work}/diagnostic.log"; }
  lock_pid="${MES_DB_LOCK_PID}"
  exec {lock_in}>&"${MES_DB_LOCK[1]}"
  exec {lock_out}<&"${MES_DB_LOCK[0]}"
  original_in="${MES_DB_LOCK[1]}"; original_out="${MES_DB_LOCK[0]}"
  exec {original_in}>&-
  exec {original_out}<&-
  printf 'SELECT CONNECTION_ID();\nSET SESSION wait_timeout=1200;\nSET SESSION lock_wait_timeout=60;\nFLUSH TABLES WITH READ LOCK;\nSELECT "easy-mes-locked";\n' >&"${lock_in}"
  IFS= read -r -t 15 -u "${lock_out}" lock_id || mes_fail 'database backup lock session did not connect'
  [[ "${lock_id}" =~ ^[0-9]+$ ]] || mes_fail 'invalid database backup lock session'
  IFS= read -r -t 75 -u "${lock_out}" ready || mes_fail 'database backup lock was not acquired in time'
  [[ "${ready}" == easy-mes-locked ]] || mes_fail 'database backup lock was not confirmed'
  started_at="$(date --iso-8601=seconds)"
  [[ "$(mes_mysql --execute="SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}' AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'" 2>"${work}/diagnostic.log")" == 0 ]] || \
    mes_fail 'single-transaction backup requires every base table to use InnoDB'
  version="$(mes_mysql --execute='SELECT VERSION()' 2>"${work}/diagnostic.log")"
  charset="$(mes_mysql --execute="SELECT DEFAULT_CHARACTER_SET_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${database}'" 2>"${work}/diagnostic.log")"
  collation="$(mes_mysql --execute="SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${database}'" 2>"${work}/diagnostic.log")"
  mes_log "Creating ${mode} MySQL backup for ${database}."
  # 只传一个库名，避免 dump 写入 CREATE DATABASE / USE，便于恢复到新库。
  # mysqldump 保留字符集、SQL_MODE、触发器顺序；先装载数据再创建触发器。
  mes_mysql_program mysqldump --default-character-set=utf8mb4 --single-transaction \
    --quick --hex-blob --routines --events --triggers --no-tablespaces \
    --set-gtid-purged=OFF --skip-add-drop-table --skip-add-locks --skip-lock-tables \
    "${database}" 2>"${work}/diagnostic.log" | gzip -n >"${work}/database.sql.gz"
  gzip -t "${work}/database.sql.gz" || mes_fail 'compressed dump validation failed'
  if gzip -cd "${work}/database.sql.gz" | awk '
    /^[[:space:]]*(\/\*![0-9]+[[:space:]]+)?(USE|CREATE[[:space:]]+DATABASE)[[:space:]]/ { found=1 }
    END { exit !found }
  '; then mes_fail 'dump unexpectedly selects or creates a database'; fi
  mes_write_inventory "${database}" "${work}" 2>"${work}/diagnostic.log"
  printf 'SELECT "easy-mes-still-locked";\n' >&"${lock_in}"
  IFS= read -r -t 15 -u "${lock_out}" ready || mes_fail 'database lock session was lost during backup'
  [[ "${ready}" == easy-mes-still-locked ]] || mes_fail 'database lock session verification failed'
  printf 'UNLOCK TABLES;\n' >&"${lock_in}"
  exec {lock_in}>&-
  lock_in=''
  wait "${lock_pid}" || mes_fail 'database backup lock session failed'
  lock_pid=''; lock_id=''
  exec {lock_out}<&-
  lock_out=''
  # metadata 记录数据对应的库及新旧镜像，不包含密码；四份产物一起计算校验和。
  printf 'format_version=1\nmode=%s\nstarted_at=%s\ncompleted_at=%s\nsource_database=%s\nmysql_version=%s\ncharacter_set=%s\ncollation=%s\ncurrent_api_image=%s\ncurrent_web_image=%s\ntarget_api_image=%s\n' \
    "${mode}" "${started_at}" "$(date --iso-8601=seconds)" "${database}" "${version}" "${charset}" "${collation}" \
    "$(mes_current_image)" "$(mes_current_image WEB_IMAGE)" "${target}" >"${work}/metadata.env"
  rm -f -- "${work}/diagnostic.log"
  (cd -- "${work}" && sha256sum database.sql.gz metadata.env objects.tsv rows.tsv >SHA256SUMS)
  chmod 600 "${work}"/*
  # 全部成功后才将隐藏临时目录改为正式目录；目录名时间为 UTC，定时窗口为北京时间。
  final_name="${MES_BACKUP_DIR}/$(date -u +%Y%m%dT%H%M%SZ)-${mode}-${work##*.}"
  mv -T -- "${work}" "${final_name}"
  work=''
  backup_finished=true
  mes_log "Backup completed: ${final_name}"
  # release 到这里就保持停写；普通/定时备份则恢复原服务并检查 readiness。
  if [[ "${mode}" != release ]]; then
    if [[ "${api_was_running}" == true ]]; then
      mes_log 'Restarting the API that was running before this backup.'
      if ! mes_compose up -d --no-deps --wait api || ! mes_wait_api_ready; then
        MES_BACKUP_DEADLINE_EPOCH=0 MES_COMMAND_TIMEOUT=80 mes_compose stop --timeout 60 web api || true
        mes_fail 'backup succeeded but API readiness failed; maintenance is still active'
      fi
    fi
    if ! mes_restore_web; then
      MES_BACKUP_DEADLINE_EPOCH=0 MES_COMMAND_TIMEOUT=80 mes_compose stop --timeout 60 web api || true
      mes_fail 'backup succeeded but Web restart failed; maintenance is still active'
    fi
    rm -f -- "${MES_MAINTENANCE_FILE}"
  fi
)
