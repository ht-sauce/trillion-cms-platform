/**
 * 静态文件接口：上传（multipart/form-data）、列表、删除
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { StaticFilesService } from './static-files.service'
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard'
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator'
import { normalizePage, normalizePageSize } from '../../common/constants'

@ApiTags('静态文件')
@ApiBearerAuth()
@Controller('files')
@UseGuards(AdminAuthGuard)
export class StaticFilesController {
  constructor(private readonly service: StaticFilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        siteId: { type: 'string' }
      }
    }
  })
  @ApiOperation({ summary: '上传静态文件，返回 URL 表记录' })
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('siteId') siteId?: string,
    @Body('caption') caption?: string
  ) {
    return this.service.upload(user, file, siteId || undefined, caption)
  }

  @Get()
  @ApiOperation({ summary: '静态文件列表' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('siteId') siteId?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.service.list(user, siteId || undefined, keyword, normalizePage(page), normalizePageSize(pageSize))
  }

  @Put(':id/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' }
      }
    }
  })
  @ApiOperation({ summary: '替换文件内容：URL 与物理路径不变，仅覆盖文件（MIME 必须与原记录一致）' })
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    return this.service.replace(user, id, file)
  }

  @Patch(':id/caption')
  @ApiOperation({ summary: '更新图片备注（标识素材引用位置）' })
  updateCaption(@Param('id', ParseUUIDPipe) id: string, @Body('caption') caption?: string) {
    return this.service.updateCaption(id, caption)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除静态文件' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id)
  }
}
