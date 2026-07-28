import { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteMessageBox } from '../route-message-box';

describe('RouteMessageBox', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts confirmations inside the active route content region', () => {
    const routeContent = document.createElement('main');
    routeContent.className = 'content';
    document.body.append(routeContent);
    const confirm = vi
      .spyOn(ElMessageBox, 'confirm')
      .mockImplementation(
        () => Promise.resolve('confirm') as ReturnType<typeof ElMessageBox.confirm>,
      );

    void RouteMessageBox.confirm('确认操作？', '操作确认', { type: 'warning' });

    expect(confirm).toHaveBeenCalledWith(
      '确认操作？',
      '操作确认',
      expect.objectContaining({
        type: 'warning',
        appendTo: routeContent,
      }),
    );
  });
});
