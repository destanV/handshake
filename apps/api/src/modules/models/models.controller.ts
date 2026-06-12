import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ModelsService } from "./models.service";
import type { ListModelsQueryDto } from "./requests/list-models-query-dto";
import type { UpdateBlockchainDTO } from "./requests/update-blockchain.dto";
import { UpdateBlockchainSchema } from "./requests/update-blockchain.dto";
import { AuthGuard } from "../auth/auth.guard";
import type { Request } from "express";
import type { CreateModelDTO} from "@handshake/types";
import { CreateModelSchema } from "@handshake/types";
import { ValidationPipe } from "@api/common/pipes/zod-validation.pipe";
import { ListModelsDocs, CheckDuplicateDocs, GetModelDocs, CreateModelDocs, UpdateBlockchainDocs } from "./models.docs";

type AuthRequest = Request & { user: { walletAddress: string } };

@ApiTags("models")
@Controller("models")
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ListModelsDocs()
  listModels(@Query() query: ListModelsQueryDto) {
    return this.modelsService.listModels(query);
  }

  @Get("check/:hash")
  @HttpCode(HttpStatus.OK)
  @CheckDuplicateDocs()
  checkDuplicate(@Param("hash") hash: string) {
    return this.modelsService.checkDuplicate(hash);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @GetModelDocs()
  getModel(@Param("id") id: string) {
    return this.modelsService.getModel(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @CreateModelDocs()
  createModel(
    @Body(new ValidationPipe(CreateModelSchema)) body: CreateModelDTO,
    @Req() req: AuthRequest,
  ) {
    return this.modelsService.createModel(body, req.user.walletAddress);
  }

  @Patch(":id/blockchain")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @UpdateBlockchainDocs()
  updateBlockchain(
    @Param("id") id: string,
    @Body(new ValidationPipe(UpdateBlockchainSchema)) body: UpdateBlockchainDTO,
    @Req() req: AuthRequest,
  ) {
    return this.modelsService.updateBlockchainRecord(id, body, req.user.walletAddress);
  }
}
