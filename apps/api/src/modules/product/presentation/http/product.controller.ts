import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@company/constants';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductService } from '../../application/product.service.js';
import { ProductDomainExceptionFilter } from './product-domain-exception.filter.js';
import {
  DefaultRouteDto,
  ProcessRouteDto,
  ProcessRouteQueryDto,
  ProcessRouteStatusDto,
  ProcessStepDto,
  ProcessStepQueryDto,
  ProductCategoryDto,
  ProductCategoryQueryDto,
  ProductDto,
  ProductListQueryDto,
  ProductIdParamDto,
  MaterialVariantDto,
  MaterialVariantQueryDto,
  MaterialVariantMaterialParamDto,
  ReplaceProcessRouteStepsDto,
  ReplaceProductMaterialsDto,
  StatusDto,
  SetDefaultSopDto,
  TechnicalFileQueryDto,
} from './dto/product.dto.js';
import { decodeMultipartFileName } from './multipart-file-name.js';
import {
  assertTechnicalFileType,
  technicalFileUploadOptions,
} from './technical-file-upload.validation.js';

type UploadedSop = { originalname: string; mimetype: string; buffer: Buffer; size: number };

@Controller('product')
@UseFilters(ProductDomainExceptionFilter)
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get('technical-files')
  @RequirePermission(PERMISSIONS.product.files.view)
  technicalFiles(@Query() query: TechnicalFileQueryDto) {
    return this.service.listTechnicalFiles({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
      storageProvider: query.storageProvider,
    });
  }

  @Post('technical-files')
  @RequirePermission(PERMISSIONS.product.files.upload)
  @AuditInApplication()
  @UseInterceptors(FileInterceptor('file', technicalFileUploadOptions))
  uploadTechnicalFile(
    @UploadedFile() file: UploadedSop | undefined,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.uploadTechnicalFile(toTechnicalFileUpload(file), audit);
  }

  @Get('technical-files/:id/content')
  @RequirePermission(PERMISSIONS.product.files.download)
  async downloadTechnicalFile(
    @Param() { id }: ProductIdParamDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    const { file, stream } = await this.service.downloadTechnicalFile(id);
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', contentDisposition(file.originalName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(stream);
  }

  /**
   * 技术文件删除能力暂不对外开放。
   *
   * 恢复 DELETE /technical-files/:id 前必须同时满足：
   * 1. 仅软删除 technical_files 元数据，禁止物理删除对象存储内容；
   * 2. 删除前校验 process_steps 与有效 process_route_steps 的当前引用；
   * 3. 历史生产任务必须通过 batch_step_records 冻结的对象定位快照下载 SOP，
   *    不得再依赖 technical_files 当前状态或通用有效文件下载接口；
   * 4. 保留删除审计，并补齐当前引用、历史快照和并发场景的集成测试。
   */

  @Get('categories')
  @RequirePermission(PERMISSIONS.product.categories.view)
  categories(@Query() query: ProductCategoryQueryDto) {
    return this.service.listCategories({
      page: query.page,
      pageSize: query.pageSize,
      categoryCode: query.categoryCode?.trim() || undefined,
      categoryName: query.categoryName?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('categories/options')
  // 跨页面选项授权：产品页（分类筛选/表单）或分类页（父分类）任一视图权限即可读取
  @RequirePermission([PERMISSIONS.product.products.view, PERMISSIONS.product.categories.view])
  categoryOptions() {
    return this.service.listCategoryOptions();
  }
  @Post('categories')
  @RequirePermission(PERMISSIONS.product.categories.create)
  @AuditInApplication()
  createCategory(@Body() body: ProductCategoryDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createCategory(body, audit);
  }
  @Patch('categories/:id')
  @RequirePermission(PERMISSIONS.product.categories.update)
  @AuditInApplication()
  updateCategory(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProductCategoryDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateCategory(id, body, audit);
  }
  @Patch('categories/:id/status')
  @RequirePermission(PERMISSIONS.product.categories.changeStatus)
  @AuditInApplication()
  categoryStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setCategoryStatus(id, body.status, audit);
  }

  @Get('products')
  @RequirePermission(PERMISSIONS.product.products.view)
  products(@Query() query: ProductListQueryDto) {
    return this.service.listProducts({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      categoryId: query.categoryId,
      acquireMethod: query.acquireMethod,
      status: query.status,
    });
  }
  @Get('products/options')
  // 跨页面选项授权：产品页（BOM 候选）、工艺路线页（产品/BOM 候选）、生产工单/任务页（产品下拉）任一视图权限即可读取
  @RequirePermission([
    PERMISSIONS.product.products.view,
    PERMISSIONS.product.routes.view,
    PERMISSIONS.production.orders.view,
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.production.inbounds.view,
    PERMISSIONS.product.materialVariants.view,
  ])
  productOptions() {
    return this.service.listProductOptions();
  }
  @Get('material-variants')
  @RequirePermission(PERMISSIONS.product.materialVariants.view)
  materialVariants(@Query() query: MaterialVariantQueryDto) {
    return this.service.listMaterialVariants({
      page: query.page,
      pageSize: query.pageSize,
      materialProductId: query.materialProductId,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('material-variants/by-material/:materialProductId')
  @RequirePermission([
    PERMISSIONS.product.materialVariants.view,
    PERMISSIONS.product.products.view,
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.production.inbounds.view,
  ])
  materialVariantsByMaterial(@Param() { materialProductId }: MaterialVariantMaterialParamDto) {
    return this.service.listMaterialVariantsByMaterial(materialProductId);
  }
  @Post('material-variants')
  @RequirePermission(PERMISSIONS.product.materialVariants.create)
  @AuditInApplication()
  createMaterialVariant(
    @Body() body: MaterialVariantDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.createMaterialVariant(body, audit);
  }
  @Patch('material-variants/:id/status')
  @RequirePermission(PERMISSIONS.product.materialVariants.changeStatus)
  @AuditInApplication()
  materialVariantStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setMaterialVariantStatus(id, body.status, audit);
  }
  @Post('products')
  @RequirePermission(PERMISSIONS.product.products.create)
  @AuditInApplication()
  createProduct(@Body() body: ProductDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createProduct(body, audit);
  }
  @Patch('products/:id')
  @RequirePermission(PERMISSIONS.product.products.update)
  @AuditInApplication()
  updateProduct(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProductDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateProduct(id, body, audit);
  }
  @Patch('products/:id/status')
  @RequirePermission(PERMISSIONS.product.products.changeStatus)
  @AuditInApplication()
  productStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setProductStatus(id, body.status, audit);
  }
  @Get('products/:id/materials')
  @RequirePermission(PERMISSIONS.product.products.view)
  materials(@Param() { id }: ProductIdParamDto) {
    return this.service.listMaterials(id);
  }
  @Put('products/:id/materials')
  @RequirePermission(PERMISSIONS.product.products.manageBom)
  @AuditInApplication()
  replaceMaterials(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ReplaceProductMaterialsDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.replaceMaterials(id, body.items, audit);
  }
  @Patch('products/:id/default-route')
  @RequirePermission(PERMISSIONS.product.products.setDefaultRoute)
  @AuditInApplication()
  defaultRoute(
    @Param() { id }: ProductIdParamDto,
    @Body() body: DefaultRouteDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setDefaultRoute(id, body.routeId, audit);
  }

  @Get('process-steps')
  @RequirePermission(PERMISSIONS.product.processes.view)
  processSteps(@Query() query: ProcessStepQueryDto) {
    return this.service.listProcessSteps({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('process-steps/options')
  // 跨页面选项授权：工序页或工艺路线页（工序列）任一视图权限即可读取
  @RequirePermission([PERMISSIONS.product.processes.view, PERMISSIONS.product.routes.view])
  processStepOptions() {
    return this.service.listProcessStepOptions();
  }
  @Post('process-steps')
  @RequirePermission(PERMISSIONS.product.processes.create)
  @AuditInApplication()
  createProcessStep(@Body() body: ProcessStepDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createProcessStep(body, audit);
  }
  @Patch('process-steps/:id')
  @RequirePermission(PERMISSIONS.product.processes.update)
  @AuditInApplication()
  updateProcessStep(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessStepDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateProcessStep(id, body, audit);
  }
  @Patch('process-steps/:id/status')
  @RequirePermission(PERMISSIONS.product.processes.changeStatus)
  @AuditInApplication()
  processStepStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setProcessStepStatus(id, body.status, audit);
  }
  @Post('process-steps/:id/sop')
  @RequirePermission(PERMISSIONS.product.processes.uploadSop)
  @AuditInApplication()
  @UseInterceptors(FileInterceptor('file', technicalFileUploadOptions))
  uploadSop(
    @Param() { id }: ProductIdParamDto,
    @UploadedFile() file: UploadedSop | undefined,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.uploadProcessStepSop(id, toTechnicalFileUpload(file), audit);
  }

  @Patch('process-steps/:id/default-sop')
  @RequirePermission(PERMISSIONS.product.files.attach)
  @AuditInApplication()
  defaultSop(
    @Param() { id }: ProductIdParamDto,
    @Body() body: SetDefaultSopDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setProcessStepDefaultSop(id, body.fileId, audit);
  }

  @Get('process-routes')
  @RequirePermission(PERMISSIONS.product.routes.view)
  routes(@Query() query: ProcessRouteQueryDto) {
    return this.service.listRoutes({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('process-routes/options')
  // 跨页面选项授权：产品页（默认路线下拉）、工艺路线页、生产工单/任务页（路线下拉）任一视图权限即可读取
  @RequirePermission([
    PERMISSIONS.product.products.view,
    PERMISSIONS.product.routes.view,
    PERMISSIONS.production.orders.view,
    PERMISSIONS.production.tasks.view,
  ])
  routeOptions() {
    return this.service.listRouteOptions();
  }
  @Post('process-routes')
  @RequirePermission(PERMISSIONS.product.routes.create)
  @AuditInApplication()
  createRoute(@Body() body: ProcessRouteDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createRoute(body, audit);
  }
  @Patch('process-routes/:id')
  @RequirePermission(PERMISSIONS.product.routes.update)
  @AuditInApplication()
  updateRoute(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessRouteDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateRoute(id, body, audit);
  }
  @Patch('process-routes/:id/status')
  @RequirePermission(PERMISSIONS.product.routes.changeStatus)
  @AuditInApplication()
  routeStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessRouteStatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setRouteStatus(id, body.status, audit);
  }
  @Delete('process-routes/:id')
  @RequirePermission(PERMISSIONS.product.routes.delete)
  @AuditInApplication()
  deleteRoute(@Param() { id }: ProductIdParamDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.deleteRoute(id, audit);
  }
  @Get('process-routes/:id/steps')
  @RequirePermission(PERMISSIONS.product.routes.view)
  routeSteps(@Param() { id }: ProductIdParamDto) {
    return this.service.listRouteSteps(id);
  }
  @Put('process-routes/:id/steps')
  @RequirePermission(PERMISSIONS.product.routes.manageSteps)
  @AuditInApplication()
  replaceRouteSteps(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ReplaceProcessRouteStepsDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.replaceRouteSteps(id, body.items, audit);
  }
  @Get('users/options')
  // 跨页面选项授权：工艺路线页（默认负责人）、生产工单/任务页（负责人下拉）任一视图权限即可读取
  @RequirePermission([
    PERMISSIONS.product.routes.view,
    PERMISSIONS.production.orders.view,
    PERMISSIONS.production.tasks.view,
  ])
  userOptions() {
    return this.service.listUserOptions();
  }
}

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

const toTechnicalFileUpload = (file: UploadedSop | undefined) => {
  if (!file) throw new BadRequestException('请选择要上传的 SOP 文件');
  const originalName = decodeMultipartFileName(file.originalname);
  assertTechnicalFileType(originalName, file.mimetype);
  return {
    originalName,
    mimeType: file.mimetype || 'application/octet-stream',
    buffer: file.buffer,
  };
};

const contentDisposition = (fileName: string) => {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 150) || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};
