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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@company/constants';
import type { AuditContext } from '../../../identity/application/audit.types.js';
import {
  AuditInApplication,
  CurrentAuditContext,
  RequirePermission,
} from '../../../identity/presentation/http/auth.decorators.js';
import { ProductService } from '../../application/product.service.js';
import {
  DefaultRouteDto,
  ProcessRouteDto,
  ProcessRouteStatusDto,
  ProcessStepDto,
  ProductCategoryDto,
  ProductDto,
  ProductIdParamDto,
  ReplaceProcessRouteStepsDto,
  ReplaceProductMaterialsDto,
  StatusDto,
} from './dto/product.dto.js';

type UploadedSop = { originalname: string; mimetype: string; buffer: Buffer; size: number };

@Controller('product')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get('categories')
  @RequirePermission(PERMISSIONS.product.categories.view)
  categories() {
    return this.service.listCategories();
  }
  @Post('categories')
  @RequirePermission(PERMISSIONS.product.categories.create)
  @AuditInApplication()
  createCategory(@Body() body: ProductCategoryDto, @CurrentAuditContext() audit: AuditContext) {
    return this.service.createCategory(body, audit);
  }
  @Patch('categories/:id')
  @RequirePermission(PERMISSIONS.product.categories.update)
  @AuditInApplication()
  updateCategory(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProductCategoryDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.updateCategory(id, body, audit);
  }
  @Patch('categories/:id/status')
  @RequirePermission(PERMISSIONS.product.categories.changeStatus)
  @AuditInApplication()
  categoryStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.setCategoryStatus(id, body.status, audit);
  }

  @Get('products')
  @RequirePermission(PERMISSIONS.product.products.view)
  products() {
    return this.service.listProducts();
  }
  @Get('products/options')
  @RequirePermission(PERMISSIONS.product.products.view)
  productOptions() {
    return this.service.listProductOptions();
  }
  @Get('products/form-options')
  @RequirePermission(PERMISSIONS.product.products.view)
  async productFormOptions() {
    const [categories, products, routes] = await Promise.all([
      this.service.listCategories(),
      this.service.listProductOptions(),
      this.service.listRoutes(),
    ]);
    return { categories, products, routes };
  }
  @Post('products')
  @RequirePermission(PERMISSIONS.product.products.create)
  @AuditInApplication()
  createProduct(@Body() body: ProductDto, @CurrentAuditContext() audit: AuditContext) {
    return this.service.createProduct(body, audit);
  }
  @Patch('products/:id')
  @RequirePermission(PERMISSIONS.product.products.update)
  @AuditInApplication()
  updateProduct(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProductDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.updateProduct(id, body, audit);
  }
  @Patch('products/:id/status')
  @RequirePermission(PERMISSIONS.product.products.changeStatus)
  @AuditInApplication()
  productStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentAuditContext() audit: AuditContext,
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
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.replaceMaterials(id, body.items, audit);
  }
  @Patch('products/:id/default-route')
  @RequirePermission(PERMISSIONS.product.products.setDefaultRoute)
  @AuditInApplication()
  defaultRoute(
    @Param() { id }: ProductIdParamDto,
    @Body() body: DefaultRouteDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.setDefaultRoute(id, body.routeId, audit);
  }

  @Get('process-steps')
  @RequirePermission(PERMISSIONS.product.processes.view)
  processSteps() {
    return this.service.listProcessSteps();
  }
  @Post('process-steps')
  @RequirePermission(PERMISSIONS.product.processes.create)
  @AuditInApplication()
  createProcessStep(@Body() body: ProcessStepDto, @CurrentAuditContext() audit: AuditContext) {
    return this.service.createProcessStep(body, audit);
  }
  @Patch('process-steps/:id')
  @RequirePermission(PERMISSIONS.product.processes.update)
  @AuditInApplication()
  updateProcessStep(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessStepDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.updateProcessStep(id, body, audit);
  }
  @Patch('process-steps/:id/status')
  @RequirePermission(PERMISSIONS.product.processes.changeStatus)
  @AuditInApplication()
  processStepStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: StatusDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.setProcessStepStatus(id, body.status, audit);
  }
  @Post('process-steps/:id/sop')
  @RequirePermission(PERMISSIONS.product.processes.uploadSop)
  @AuditInApplication()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  uploadSop(
    @Param() { id }: ProductIdParamDto,
    @UploadedFile() file: UploadedSop | undefined,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的 SOP 文件');
    return this.service.uploadProcessStepSop(
      id,
      {
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        buffer: file.buffer,
      },
      audit,
    );
  }

  @Get('process-routes')
  @RequirePermission(PERMISSIONS.product.routes.view)
  routes() {
    return this.service.listRoutes();
  }
  @Get('process-routes/form-options')
  @RequirePermission(PERMISSIONS.product.routes.view)
  async routeFormOptions() {
    const [products, processSteps, users] = await Promise.all([
      this.service.listProductOptions(),
      this.service.listProcessSteps(),
      this.service.listUserOptions(),
    ]);
    return { products, processSteps, users };
  }
  @Post('process-routes')
  @RequirePermission(PERMISSIONS.product.routes.create)
  @AuditInApplication()
  createRoute(@Body() body: ProcessRouteDto, @CurrentAuditContext() audit: AuditContext) {
    return this.service.createRoute(body, audit);
  }
  @Patch('process-routes/:id')
  @RequirePermission(PERMISSIONS.product.routes.update)
  @AuditInApplication()
  updateRoute(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessRouteDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.updateRoute(id, body, audit);
  }
  @Patch('process-routes/:id/status')
  @RequirePermission(PERMISSIONS.product.routes.changeStatus)
  @AuditInApplication()
  routeStatus(
    @Param() { id }: ProductIdParamDto,
    @Body() body: ProcessRouteStatusDto,
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.setRouteStatus(id, body.status, audit);
  }
  @Delete('process-routes/:id')
  @RequirePermission(PERMISSIONS.product.routes.delete)
  @AuditInApplication()
  deleteRoute(@Param() { id }: ProductIdParamDto, @CurrentAuditContext() audit: AuditContext) {
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
    @CurrentAuditContext() audit: AuditContext,
  ) {
    return this.service.replaceRouteSteps(id, body.items, audit);
  }
  @Get('users/options')
  @RequirePermission(PERMISSIONS.product.routes.view)
  userOptions() {
    return this.service.listUserOptions();
  }
}
