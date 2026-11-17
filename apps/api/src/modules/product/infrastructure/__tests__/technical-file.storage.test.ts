// TODO(attachment-storage): 高重要性；原覆盖缺失持久化 bucket 时安全拒绝读取，并已登记按用途上传、私有流读取及上传失败补偿的覆盖缺口。Product S3 端口和实现已迁至 Attachment，正式测试暂缓；用户明确授权后针对 Attachment 存储端口与上传补偿恢复，禁止从当前配置猜造历史 bucket。
