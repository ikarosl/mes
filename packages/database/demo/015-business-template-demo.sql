-- Independent table templates; no Product IDs or scene registration are required.
-- Existing content, version and disabled/deleted state remain user-owned.
SET @business_template_demo_actor = (
  SELECT id FROM users WHERE username='admin' AND deleted_at IS NULL LIMIT 1
);

INSERT INTO business_templates (name,content,status,created_by,updated_by)
SELECT '微带参数模板',
  JSON_OBJECT(
    'columns',JSON_ARRAY(
      JSON_OBJECT('key','key','label','参数名称'),
      JSON_OBJECT('key','value','label','参数值'),
      JSON_OBJECT('key','unit','label','单位')
    ),
    'rows',JSON_ARRAY(
      JSON_OBJECT('key','频率范围','value','','unit','GHz'),
      JSON_OBJECT('key','插入损耗','value','','unit','dB'),
      JSON_OBJECT('key','驻波比','value','','unit',''),
      JSON_OBJECT('key','外形尺寸','value','','unit','mm')
    )
  ),
  'enabled',@business_template_demo_actor,@business_template_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM business_templates WHERE name='微带参数模板');

INSERT INTO business_templates (name,content,status,created_by,updated_by)
SELECT '机械尺寸参数模板',
  JSON_OBJECT(
    'columns',JSON_ARRAY(
      JSON_OBJECT('key','key','label','参数名称'),
      JSON_OBJECT('key','value','label','参数值'),
      JSON_OBJECT('key','unit','label','单位')
    ),
    'rows',JSON_ARRAY(
      JSON_OBJECT('key','长度','value','','unit','mm'),
      JSON_OBJECT('key','宽度','value','','unit','mm'),
      JSON_OBJECT('key','高度','value','','unit','mm'),
      JSON_OBJECT('key','重量','value','','unit','g')
    )
  ),
  'enabled',@business_template_demo_actor,@business_template_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM business_templates WHERE name='机械尺寸参数模板');

INSERT INTO business_templates (name,content,status,created_by,updated_by)
SELECT '停用参数模板示例',
  JSON_OBJECT(
    'columns',JSON_ARRAY(
      JSON_OBJECT('key','key','label','参数名称'),
      JSON_OBJECT('key','value','label','参数值'),
      JSON_OBJECT('key','unit','label','单位')
    ),
    'rows',JSON_ARRAY(JSON_OBJECT('key','参考参数','value','','unit',''))
  ),
  'disabled',@business_template_demo_actor,@business_template_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM business_templates WHERE name='停用参数模板示例');

INSERT INTO business_templates (name,content,status,created_by,updated_by)
SELECT '交接事项模板',
  JSON_OBJECT(
    'columns',JSON_ARRAY(
      JSON_OBJECT('key','topic','label','交接事项'),
      JSON_OBJECT('key','owner','label','负责人'),
      JSON_OBJECT('key','note','label','说明')
    ),
    'rows',JSON_ARRAY(
      JSON_OBJECT('topic','资料核对','owner','','note','核对当前资料'),
      JSON_OBJECT('topic','待办交接','owner','','note','')
    )
  ),
  'enabled',@business_template_demo_actor,@business_template_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM business_templates WHERE name='交接事项模板');

INSERT INTO business_templates (name,content,status,created_by,updated_by)
SELECT '空白备注模板',
  JSON_OBJECT(
    'columns',JSON_ARRAY(JSON_OBJECT('key','note','label','备注')),
    'rows',JSON_ARRAY()
  ),
  'enabled',@business_template_demo_actor,@business_template_demo_actor
WHERE NOT EXISTS (SELECT 1 FROM business_templates WHERE name='空白备注模板');
