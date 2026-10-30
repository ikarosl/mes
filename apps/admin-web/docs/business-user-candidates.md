# 业务人员配置与生产负责人

场景、角色配置和候选资格由 [Identity](../../api/src/modules/identity/docs/user-candidates.md)维护；负责人是否必填、何时重核由 [Production](../../api/src/modules/production/docs/database/work-orders-and-batches.md)维护。选择与草稿保护遵守[管理端架构](architecture.md)。

## 配置草稿

各场景独立编辑。候选人数描述已保存配置，不随尚未保存的角色选择重算；避免让预览人数冒充当前可用人数。

## 负责人选择

人员由用户明确选择，不自动指定。候选为空时提示联系管理员配置业务人员角色。人员候选与历史姓名的区别见上述所有者文档。
