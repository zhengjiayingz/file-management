import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { setPrismaBridge } from './prisma-bridge';

@Injectable()
export class PrismaBridgeInit implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    setPrismaBridge(this.prisma);
  }
}
