import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { PERMISSIONS, permissionMatches } from '@company/constants';
import type { MaterialVariantItem, UserProfile } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import {
  AuditInApplication,
  CurrentCommandContext,
  CurrentUser,
  RequireAllPermissions,
  RequirePermission,
} from '../../../../common/security/auth.decorators.js';
import { ProductService } from '../../application/product.service.js';
import { ProductDomainExceptionFilter } from './product-domain-exception.filter.js';
import {
  ProcessRouteDto,
  ProcessRouteQueryDto,
  ProcessRouteStatusDto,
  ProcessStepDto,
  ProcessStepQueryDto,
  ProductCategoryDto,
  ProductCategoryQueryDto,
  ProductDto,
  ProductUpdateDto,
  ProductListQueryDto,
  ProductIdParamDto,
  MaterialVariantDto,
  MaterialVariantSpecificationDto,
  MaterialVariantQueryDto,
  MaterialVariantMaterialParamDto,
  MaterialListQueryDto,
  MaterialDto,
  ReplaceProcessRouteStepsDto,
  ReplaceProductMaterialsDto,
  StatusDto,
  SetDefaultSopDto,
  TechnicalFileQueryDto,
  TechnicalFileUploadDto,
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
      fileType: query.fileType,
    });
  }

  @Post('technical-files')
  @RequirePermission(PERMISSIONS.product.files.upload)
  @AuditInApplication()
  @UseInterceptors(FileInterceptor('file', technicalFileUploadOptions))
  uploadTechnicalFile(
    @UploadedFile() file: UploadedSop | undefined,
    @Body() body: TechnicalFileUploadDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.uploadTechnicalFile(toTechnicalFileUpload(file), audit, body);
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
  @RequirePermission([
    PERMISSIONS.product.products.view,
    PERMISSIONS.product.materials.view,
    PERMISSIONS.product.categories.view,
  ])
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
  // 跨页面选项授权：成品页、工艺路线页或生产工单/任务页任一视图权限即可读取
  @RequirePermission([
    PERMISSIONS.product.products.view,
    PERMISSIONS.product.routes.view,
    PERMISSIONS.production.orders.view,
    PERMISSIONS.production.tasks.view,
  ])
  productOptions() {
    return this.service.listProductOptions();
  }
  @Get('materials')
  @RequirePermission([PERMISSIONS.product.products.view, PERMISSIONS.product.materials.view])
  materialMasterData(@Query() query: MaterialListQueryDto) {
    return this.service.listMaterialMasterData({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      categoryId: query.categoryId,
      acquireMethod: query.acquireMethod,
      status: query.status,
    });
  }
  @Get('materials/options')
  @RequirePermission([
    PERMISSIONS.product.materials.view,
    PERMISSIONS.product.products.view,
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.warehouse.inbound.view,
    PERMISSIONS.product.materialVariants.view,
  ])
  materialOptions() {
    return this.service.listMaterialOptions();
  }
  @Get('materials/:id/variants')
  @RequirePermission([PERMISSIONS.product.products.view, PERMISSIONS.product.materials.view])
  materialMasterDataVariants(@Param() { id }: ProductIdParamDto): Promise<MaterialVariantItem[]> {
    return this.service.listMaterialMasterDataVariants(id);
  }
  @Post('materials')
  @RequirePermission(PERMISSIONS.product.materials.create)
  @AuditInApplication()
  createMaterial(@Body() body: MaterialDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createMaterial(body, audit);
  }
  @Patch('materials/:id')
  @RequirePermission(PERMISSIONS.product.materials.update)
  @AuditInApplication()
  updateMaterial(
    @Param() { id }: ProductIdParamDto,
    @Body() body: MaterialDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.updateMaterial(id, body, audit);
  }
  @Patch('materials/:id/status')
  @RequirePermission(PERMISSIONS.product.materials.changeStatus)
  @AuditInApplication()
  materialStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setMaterialStatus(id, body.status, audit);
  }
  @Get('material-variants')
  @RequirePermission(PERMISSIONS.product.materialVariants.view)
  materialVariants(@Query() query: MaterialVariantQueryDto) {
    return this.service.listMaterialVariants({
      page: query.page,
      pageSize: query.pageSize,
      materialId: query.materialId,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    });
  }
  @Get('material-variants/by-material/:materialId')
  @RequirePermission([
    PERMISSIONS.product.materialVariants.view,
    PERMISSIONS.product.products.view,
    PERMISSIONS.production.materials.view,
    PERMISSIONS.production.materialDemands.view,
    PERMISSIONS.production.tasks.view,
    PERMISSIONS.warehouse.inbound.view,
  ])
  materialVariantsByMaterial(@Param() { materialId }: MaterialVariantMaterialParamDto) {
    return this.service.listMaterialVariantsByMaterial(materialId);
  }
  @Post('material-variants')
  @RequireAllPermissions([
    PERMISSIONS.product.materialVariants.create,
    PERMISSIONS.product.files.attach,
  ])
  @AuditInApplication()
  createMaterialVariant(
    @Body() body: MaterialVariantDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.createMaterialVariant(body, audit);
  }
  @Patch('material-variants/:id/specification')
  @RequireAllPermissions([PERMISSIONS.product.materials.update, PERMISSIONS.product.files.attach])
  @AuditInApplication()
  materialVariantSpecification(
    @Param() { id }: ProductIdParamDto,
    @Body() body: MaterialVariantSpecificationDto,
    @CurrentCommandContext() audit: CommandContext,
  ) {
    return this.service.setMaterialVariantSpecification(id, body, audit);
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
  @RequireAllPermissions([PERMISSIONS.product.products.create, PERMISSIONS.product.files.attach])
  @AuditInApplication()
  createProduct(@Body() body: ProductDto, @CurrentCommandContext() audit: CommandContext) {
    return this.service.createProduct(body, audit);
  }
  @Patch('products/:id')
  @RequirePermission(PERMISSIONS.product.products.update)
  @AuditInApplication()
  updateProduct(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProductUpdateDto,
    @CurrentCommandContext() audit: CommandContext,
    @CurrentUser() user: UserProfile,
  ) {
    if (
      body.specificationFileId !== body.expectedSpecificationFileId &&
      !permissionMatches(user.permissions, PERMISSIONS.product.files.attach)
    ) {
      throw new ForbiddenException('没有绑定技术文件的权限');
    }
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
    return this.service.replaceMaterials(id, body, audit);
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
  // 跨页面选项授权：工艺路线页或生产工单/任务页任一视图权限即可读取
  @RequirePermission([
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
  // 跨页面选项授权：工艺路线页（默认负责人）、生产任务页（负责人下拉）任一视图权限即可读取
  @RequirePermission([PERMISSIONS.product.routes.view, PERMISSIONS.production.tasks.view])
  userOptions() {
    return this.service.listUserOptions();
  }
}

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

const toTechnicalFileUpload = (file: UploadedSop | undefined) => {
  if (!file) throw new BadRequestException('请选择要上传的技术文件');
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
