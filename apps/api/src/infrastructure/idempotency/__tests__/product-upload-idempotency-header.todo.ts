// TODO(product-upload-idempotency): 验证未启用幂等的技术文件上传在对象存储与数据库副作用前拒绝 Idempotency-Key；高重要性，旧隔离 mock 只引用已移除存储入口，未覆盖实际上传管线且正式测试暂缓；获正式测试授权后按现行 HTTP 管线和统一 store 端口恢复覆盖。
