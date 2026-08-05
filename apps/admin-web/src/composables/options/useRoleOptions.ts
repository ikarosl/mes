import { systemApi } from '../../api/system';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 角色候选（/system/roles/options）：跨页复用实现、每消费方独立实例。
 *  与部门候选分开持有、分别刷新，任一失败不影响另一个（P2）。 */
export function useRoleOptions() {
  return useRefreshableOptions(() => systemApi.roleOptions(), '角色选项刷新失败，暂时保留上次数据');
}
