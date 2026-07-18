import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  createWhatsAppTemplateSchema,
  reviewWhatsAppTemplateSchema,
  validateWhatsAppTemplateContent,
  whatsappTemplateContentSchema,
} from './whatsapp-template.contract';
import { WhatsAppTemplateService } from './whatsapp-template.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const listQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

@Controller('integrations/organizations/:organizationId/whatsapp/stores/:storeId/templates')
@RequirePermission('integration.manage')
@UseGuards(AuthGuard, RbacGuard)
export class WhatsAppTemplateController {
  public constructor(private readonly templates: WhatsAppTemplateService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public list(
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedQuery = listQuerySchema.safeParse(query);
    if (!parsedQuery.success) throw new BadRequestException('Invalid request');
    return this.templates.list({ ...tenant, ...parsedQuery.data });
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  public create(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const command = this.parseMutation(idempotencyKey, organizationId, storeId, request);
    const template = createWhatsAppTemplateSchema.safeParse(body);
    if (!template.success) throw new BadRequestException('Invalid request');
    this.validateContent(template.data);
    return this.templates.create({ ...command, ...template.data });
  }

  @Post(':templateKey/versions')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  public createVersion(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('templateKey') templateKey: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const command = this.parseMutation(idempotencyKey, organizationId, storeId, request);
    const content = whatsappTemplateContentSchema.safeParse(body);
    const parsedKey = identifierSchema.safeParse(templateKey);
    if (!content.success || !parsedKey.success) throw new BadRequestException('Invalid request');
    this.validateContent(content.data);
    return this.templates.createVersion({
      ...command,
      ...content.data,
      templateKey: parsedKey.data,
    });
  }

  @Post(':templateId/review')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public review(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const command = this.parseMutation(idempotencyKey, organizationId, storeId, request);
    const review = reviewWhatsAppTemplateSchema.safeParse(body);
    const parsedId = identifierSchema.safeParse(templateId);
    if (!review.success || !parsedId.success) throw new BadRequestException('Invalid request');
    return this.templates.review({ ...command, ...review.data, templateId: parsedId.data });
  }

  @Post(':templateId/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public activate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.templates.activate(
      this.parseLifecycle(idempotencyKey, organizationId, storeId, templateId, request),
    );
  }

  @Post(':templateId/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public deactivate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Param('templateId') templateId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.templates.deactivate(
      this.parseLifecycle(idempotencyKey, organizationId, storeId, templateId, request),
    );
  }

  private validateContent(content: z.infer<typeof whatsappTemplateContentSchema>): void {
    try {
      validateWhatsAppTemplateContent(content);
    } catch {
      throw new BadRequestException('Invalid request');
    }
  }

  private parseLifecycle(
    idempotencyKey: string | undefined,
    organizationId: string,
    storeId: string,
    templateId: string,
    request: AuthenticatedRequest,
  ) {
    const command = this.parseMutation(idempotencyKey, organizationId, storeId, request);
    const parsedId = identifierSchema.safeParse(templateId);
    if (!parsedId.success) throw new BadRequestException('Invalid request');
    return { ...command, templateId: parsedId.data };
  }

  private parseMutation(
    idempotencyKey: string | undefined,
    organizationId: string,
    storeId: string,
    request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedKey.success) throw new BadRequestException('Invalid request');
    return { ...tenant, idempotencyKey: parsedKey.data };
  }

  private parseTenant(organizationId: string, storeId: string, request: AuthenticatedRequest) {
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    const parsedStoreId = identifierSchema.safeParse(storeId);
    if (!parsedOrganizationId.success || !parsedStoreId.success || request.auth === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return {
      organizationId: parsedOrganizationId.data,
      principal: request.auth,
      storeId: parsedStoreId.data,
    };
  }
}
