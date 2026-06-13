import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ModelsModule } from "./modules/models/models.module";
import { AuthModule } from "./modules/auth/auth.module";
import { IpfsModule } from "./modules/ipfs/ipfs.module";
import { BlockchainModule } from "./modules/blockchain/blockchain.module";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI ?? "mongodb://localhost:27017/handshake"),
    AuthModule,
    ModelsModule,
    IpfsModule,
    BlockchainModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
