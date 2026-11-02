import type { Connection, RowDataPacket } from '../../../apps/api/node_modules/mysql2/promise.js';

const schemaQueries = {
  schema: `SELECT DEFAULT_CHARACTER_SET_NAME characterSet, DEFAULT_COLLATION_NAME collation
    FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE()`,
  tables: `SELECT TABLE_NAME tableName,TABLE_TYPE tableType,ENGINE engine,ROW_FORMAT rowFormat,
      TABLE_COLLATION collation,CREATE_OPTIONS createOptions,TABLE_COMMENT comment
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_schema_migrations' ORDER BY TABLE_NAME`,
  columns: `SELECT TABLE_NAME tableName,COLUMN_NAME columnName,ORDINAL_POSITION position,
      COLUMN_TYPE columnType,IS_NULLABLE nullable,COLUMN_DEFAULT defaultValue,EXTRA extra,
      CHARACTER_SET_NAME characterSet,COLLATION_NAME collation,COLUMN_COMMENT comment,
      GENERATION_EXPRESSION generationExpression,SRS_ID srsId
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_schema_migrations'
    ORDER BY TABLE_NAME,ORDINAL_POSITION`,
  indexes: `SELECT TABLE_NAME tableName,INDEX_NAME indexName,NON_UNIQUE nonUnique,
      SEQ_IN_INDEX position,COLUMN_NAME columnName,COLLATION collation,SUB_PART subPart,
      NULLABLE nullable,INDEX_TYPE indexType,COMMENT comment,INDEX_COMMENT indexComment,
      IS_VISIBLE visible,EXPRESSION expression
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_schema_migrations'
    ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
  constraints: `SELECT TABLE_NAME tableName,CONSTRAINT_NAME constraintName,
      CONSTRAINT_TYPE constraintType,ENFORCED enforced
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME<>'_schema_migrations'
    ORDER BY TABLE_NAME,CONSTRAINT_NAME`,
  foreignKeys: `SELECT k.TABLE_NAME tableName,k.CONSTRAINT_NAME constraintName,
      k.COLUMN_NAME columnName,k.ORDINAL_POSITION position,
      k.POSITION_IN_UNIQUE_CONSTRAINT uniquePosition,
      k.REFERENCED_TABLE_NAME referencedTable,k.REFERENCED_COLUMN_NAME referencedColumn,
      r.UNIQUE_CONSTRAINT_NAME referencedConstraint,r.MATCH_OPTION matchOption,
      r.UPDATE_RULE updateRule,r.DELETE_RULE deleteRule
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
      AND r.TABLE_NAME=k.TABLE_NAME
    WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
  checks: `SELECT t.TABLE_NAME tableName,c.CONSTRAINT_NAME constraintName,
      c.CHECK_CLAUSE clause,t.ENFORCED enforced
    FROM information_schema.CHECK_CONSTRAINTS c
    JOIN information_schema.TABLE_CONSTRAINTS t
      ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME
    WHERE c.CONSTRAINT_SCHEMA=DATABASE() AND t.TABLE_NAME<>'_schema_migrations'
    ORDER BY t.TABLE_NAME,c.CONSTRAINT_NAME`,
  triggers: `SELECT TRIGGER_NAME triggerName,EVENT_OBJECT_TABLE tableName,
      EVENT_MANIPULATION event,ACTION_TIMING timing,ACTION_ORDER actionOrder,
      ACTION_CONDITION actionCondition,ACTION_STATEMENT statement,ACTION_ORIENTATION orientation,
      SQL_MODE sqlMode,CHARACTER_SET_CLIENT characterSetClient,
      COLLATION_CONNECTION collationConnection,DATABASE_COLLATION databaseCollation
    FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
    ORDER BY EVENT_OBJECT_TABLE,ACTION_TIMING,EVENT_MANIPULATION,ACTION_ORDER`,
  routines: `SELECT ROUTINE_NAME routineName,ROUTINE_TYPE routineType,
      DATA_TYPE dataType,ROUTINE_DEFINITION definition,SQL_MODE sqlMode,
      CHARACTER_SET_CLIENT characterSetClient,COLLATION_CONNECTION collationConnection,
      DATABASE_COLLATION databaseCollation
    FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() ORDER BY ROUTINE_NAME`,
  events: `SELECT EVENT_NAME eventName,EVENT_DEFINITION definition,EVENT_TYPE eventType,
      INTERVAL_VALUE intervalValue,INTERVAL_FIELD intervalField,STATUS status,
      SQL_MODE sqlMode,CHARACTER_SET_CLIENT characterSetClient,
      COLLATION_CONNECTION collationConnection,DATABASE_COLLATION databaseCollation
    FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() ORDER BY EVENT_NAME`,
} as const;

export type SchemaSnapshot = Record<keyof typeof schemaQueries, Record<string, unknown>[]>;

/** Stable physical schema; deployment identities, AUTO_INCREMENT cursors and migration metadata are excluded. */
export const captureSchemaSnapshot = async (connection: Connection): Promise<SchemaSnapshot> => {
  const snapshot = {} as SchemaSnapshot;
  for (const [key, sql] of Object.entries(schemaQueries)) {
    const [rows] = await connection.query<RowDataPacket[]>(sql);
    snapshot[key as keyof SchemaSnapshot] = rows.map((row) => {
      const entry = { ...row };
      // MySQL records the protocol separator for a single SIGNAL when it is followed by
      // another statement. Only that optional separator is normalized; compound bodies stay exact.
      if (
        key === 'triggers' &&
        typeof entry.statement === 'string' &&
        /^SIGNAL\s+SQLSTATE\s+'[A-Z0-9]{5}'\s+SET\s+MESSAGE_TEXT\s*=\s*'(?:''|[^'])*';?$/i.test(
          entry.statement,
        )
      ) {
        entry.statement = entry.statement.replace(/;$/, '');
      }
      return entry;
    });
  }
  return snapshot;
};

export const capturePermissionCatalog = async (
  connection: Connection,
): Promise<Record<string, unknown>[]> => {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT p.code,p.name,parent.code parentCode,p.type,p.route_path routePath,
       p.api_method apiMethod,p.api_path apiPath,p.sort_order sortOrder,p.status,
       p.deleted_at IS NOT NULL deleted
     FROM permissions p LEFT JOIN permissions parent ON parent.id=p.parent_id ORDER BY p.code`,
  );
  return rows.map((row) => ({ ...row }));
};
