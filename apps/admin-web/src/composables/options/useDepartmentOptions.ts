import { systemApi } from '../../api/system';
import { useRefreshableOptions } from './useRefreshableOptions';

/** 部门候选（/system/departments/options）：跨页复用实现、每消费方独立实例。
 *  与角色候选分开持有、分别刷新，任一失败不影响另一个（P2）。 */
export function useDepartmentOptions() {
  return useRefreshableOptions(
    () => systemApi.departmentOptions(),
    '部门选项刷新失败，暂时保留上次数据',
  );
}
