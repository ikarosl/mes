import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import ProcessesPage from '../ProcessesPage.vue';

const { list, setStatus, confirm, success, error, technicalFileContent } = vi.hoisted(() => ({
  list: vi.fn(),
  setStatus: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  technicalFileContent: vi.fn(),
}));

vi.mock('../../../api/product', () => ({
  productApi: {
    processSteps: list,
    setProcessStepStatus: setStatus,
    technicalFileContent,
  },
}));
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ can: () => true }),
}));
vi.mock('../../../utils/route-message-box', () => ({
  RouteMessageBox: { confirm },
}));
vi.mock('../../../utils/message', () => ({
  EMessage: { success, error, warning: vi.fn() },
}));

const processRow = {
  id: 's1',
  stepCode: 'S001',
  stepName: '装配',
  description: null,
  sopFileName: null,
  status: 1,
};

const sopRow = {
  id: 's2',
  stepCode: 'S002',
  stepName: '焊接',
  description: null,
  defaultSopFileId: 'f1',
  sopFileName: '焊接SOP.pdf',
  status: 1,
};

const createObjectURL = vi.fn(() => 'blob:sop-1');
const revokeObjectURL = vi.fn();
const windowOpen = vi.fn();

const mountPage = () =>
  mount(ProcessesPage, {
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: {
        TableToolbar: true,
        PaginationFooter: true,
        ProcessStepFormDialog: true,
        ProcessStepDetailDialog: true,
      },
    },
  });

describe('ProcessesPage row write guard', () => {
  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
    setStatus.mockReset();
    setStatus.mockResolvedValue(undefined);
    confirm.mockReset();
  });

  it('disables the toggle-status button while the write is pending and submits once', async () => {
    list.mockResolvedValue({ items: [processRow], total: 1, page: 1, pageSize: 10 });
    let confirmResolve!: (value: unknown) => void;
    confirm.mockReturnValue(new Promise((resolve) => (confirmResolve = resolve)));

    const wrapper = mountPage();
    await flushPromises();

    const findToggle = () => wrapper.findAll('button').find((b) => b.text().trim() === '停用');
    expect(findToggle()).toBeDefined();
    expect(findToggle()!.attributes('disabled')).toBeUndefined();

    await findToggle()!.trigger('click');
    await nextTick();
    expect(findToggle()!.attributes('disabled')).toBeDefined(); // 确认框期间行内写操作被占用
    expect(setStatus).not.toHaveBeenCalled();

    confirmResolve('confirm');
    await flushPromises();
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith('s1', 0);
    expect(findToggle()!.attributes('disabled')).toBeUndefined(); // 写操作结束释放
  });
});

describe('ProcessesPage SOP file actions', () => {
  beforeEach(() => {
    list.mockReset();
    list.mockResolvedValue({ items: [sopRow], total: 1, page: 1, pageSize: 10 });
    technicalFileContent.mockReset();
    technicalFileContent.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    createObjectURL.mockReset().mockReturnValue('blob:sop-1');
    revokeObjectURL.mockReset();
    windowOpen.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });
    Object.defineProperty(window, 'open', { writable: true, value: windowOpen });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews a browser-safe SOP through an authenticated blob url', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const previewButton = wrapper.findAll('button').find((b) => b.text().trim() === '预览');
    expect(previewButton).toBeDefined();

    await previewButton!.trigger('click');
    await flushPromises();

    expect(technicalFileContent).toHaveBeenCalledTimes(1);
    expect(technicalFileContent).toHaveBeenCalledWith('f1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(windowOpen).toHaveBeenCalledWith('blob:sop-1', '_blank', 'noopener');
  });

  it('downloads an SOP through an authenticated blob url and a temporary anchor', async () => {
    const wrapper = mountPage();
    await flushPromises();

    const downloadButton = wrapper.findAll('button').find((b) => b.text().trim() === '下载');
    expect(downloadButton).toBeDefined();

    await downloadButton!.trigger('click');
    await flushPromises();

    expect(technicalFileContent).toHaveBeenCalledTimes(1);
    expect(technicalFileContent).toHaveBeenCalledWith('f1');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('shows preview only for browser-safe SOP files', async () => {
    list.mockResolvedValue({
      items: [{ ...sopRow, sopFileName: '焊接SOP.docx' }],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    const wrapper = mountPage();
    await flushPromises();

    const buttons = wrapper.findAll('button').map((b) => b.text().trim());
    expect(buttons).toContain('下载');
    expect(buttons).not.toContain('预览');
  });
});
