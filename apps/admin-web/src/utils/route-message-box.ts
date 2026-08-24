import { ElMessageBox } from 'element-plus';

type ConfirmOptions = NonNullable<Parameters<typeof ElMessageBox.confirm>[2]>;
type PromptOptions = NonNullable<Parameters<typeof ElMessageBox.prompt>[2]>;

const getRouteContent = (): HTMLElement | undefined =>
  document.querySelector<HTMLElement>('.content') ?? undefined;

export const RouteMessageBox = {
  confirm(
    message: string,
    title: string,
    options: ConfirmOptions = {},
  ): ReturnType<typeof ElMessageBox.confirm> {
    return ElMessageBox.confirm(message, title, {
      ...options,
      appendTo: getRouteContent(),
    });
  },
  prompt(
    message: string,
    title: string,
    options: PromptOptions = {},
  ): ReturnType<typeof ElMessageBox.prompt> {
    return ElMessageBox.prompt(message, title, {
      ...options,
      appendTo: getRouteContent(),
    });
  },
  close(): void {
    ElMessageBox.close();
  },
};
