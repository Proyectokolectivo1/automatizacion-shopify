import { Module } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { OutboxWorkerService } from './outbox-worker.service';

@Module({ providers: [EnvironmentService, PrismaService, OutboxWorkerService] })
export class OutboxWorkerModule {}
