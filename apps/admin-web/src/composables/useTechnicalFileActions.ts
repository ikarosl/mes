import { ref, watch } from 'vue';
import type { TechnicalFileListItem } from '@company/contracts';
import { productApi } from '../api/product';
import { previewMimeOf } from '../utils/file-preview';
import { EMessage } from '../utils/message';
import { useLatestReadRequest } from './requests/useLatestReadRequest';

export function useTechnicalFileActions(
  getFile: () => Pick<TechnicalFileListItem, 'id' | 'originalName'> | null,
  active: () => boolean = () => true,
) {
  const pendingAction = ref<'preview' | 'download' | null>(null);
  const reads = useLatestReadRequest(() => (pendingAction.value = null));
  watch([() => getFile()?.id, active], reads.invalidate, { flush: 'sync' });
  const run = async (action: 'preview' | 'download'): Promise<void> => {
    const file = getFile();
    if (!file || !active() || pendingAction.value || !reads.isActive()) return;
    const { isCurrent, signal } = reads.begin(() => active() && getFile()?.id === file.id);
    pendingAction.value = action;
    try {
      const blob = await productApi.technicalFileContent(file.id, {
        signal,
        skipErrorHandling: true,
      });
      if (!isCurrent()) return;
      const mime = previewMimeOf(file.originalName, blob.type);
      const target =
        action === 'preview' && mime !== blob.type ? new Blob([blob], { type: mime }) : blob;
      const url = URL.createObjectURL(target);
      if (action === 'preview') window.open(url, '_blank', 'noopener');
      else {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = file.originalName;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        EMessage.success('文件已下载');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (isCurrent())
        EMessage.error(error, action === 'preview' ? '文件预览失败' : '文件下载失败');
    } finally {
      if (isCurrent()) pendingAction.value = null;
    }
  };
  return { pendingAction, preview: () => run('preview'), download: () => run('download') };
}
