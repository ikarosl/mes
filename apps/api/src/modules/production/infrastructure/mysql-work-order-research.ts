import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type {
  ResearchWorkOrderReference,
  WorkOrderDetail,
  WorkOrderType,
} from '@company/contracts';
import { ProductionDomainError } from '../domain/production.errors.js';
import type { Db, WorkOrderRow } from './mysql-production.shared.js';

type ResearchOrderRow = RowDataPacket & {
  id: number;
  work_order_no: string;
  order_type: WorkOrderType;
  product_id: number;
  product_code_snapshot: string;
  product_name_snapshot: string;
  status: ResearchWorkOrderReference['status'];
};

const RESEARCH_ORDER_SELECT = `SELECT id,work_order_no,order_type,product_id,
  product_code_snapshot,product_name_snapshot,status FROM work_orders`;

/** 前序已结束且不可恢复；在创建/编辑事务内仍锁定校验，不信任资料带出的客户端。 */
export const requireResearchPredecessor = async (
  db: PoolConnection,
  previousId: string | null,
  orderType: WorkOrderType,
  productId: string,
): Promise<void> => {
  if (previousId === null) return;
  if (orderType !== 'research')
    throw new ProductionDomainError('INVALID_INPUT', '关联前序研发工单的新工单必须保持研发类型');
  const [[previous]] = await db.query<ResearchOrderRow[]>(
    `${RESEARCH_ORDER_SELECT} WHERE id=? FOR UPDATE`,
    [previousId],
  );
  if (!previous) throw new ProductionDomainError('NOT_FOUND', '前序研发工单不存在');
  if (previous.order_type !== 'research' || !['completed', 'closed'].includes(previous.status))
    throw new ProductionDomainError('INVALID_STATE', '请先完成或关闭前序研发工单，再开启下一轮');
  if (String(previous.product_id) === productId)
    throw new ProductionDomainError('INVALID_INPUT', '下一轮研发必须选择与前序不同的新成品编码');
};

const reference = (row: ResearchOrderRow): ResearchWorkOrderReference => ({
  id: String(row.id),
  workOrderNo: row.work_order_no,
  productId: String(row.product_id),
  productCode: row.product_code_snapshot,
  productName: row.product_name_snapshot,
  status: row.status,
});

export const readResearchOrderRelations = async (
  db: Db,
  order: WorkOrderRow,
): Promise<Pick<WorkOrderDetail, 'previousResearchOrder' | 'nextResearchOrders'>> => {
  if (order.order_type !== 'research')
    return { previousResearchOrder: null, nextResearchOrders: [] };
  const [rows] = await db.query<
    (ResearchOrderRow & { previous_research_order_id: number | null })[]
  >(
    `SELECT id,work_order_no,order_type,product_id,product_code_snapshot,product_name_snapshot,
      status,previous_research_order_id FROM work_orders
     WHERE id=? OR previous_research_order_id=? ORDER BY id`,
    [order.previous_research_order_id, order.id],
  );
  const previous = rows.find((row) => row.id === order.previous_research_order_id);
  return {
    previousResearchOrder: previous ? reference(previous) : null,
    nextResearchOrders: rows
      .filter((row) => row.previous_research_order_id === order.id)
      .map(reference),
  };
};
