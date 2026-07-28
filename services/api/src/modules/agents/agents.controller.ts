import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { RecordAgentFloatDto } from './dto/record-agent-float.dto';
import { UpdateAgentStatusDto } from './dto/update-agent-status.dto';

/**
 * Permission OR-checks live in AgentsService (staff.read | user.read | collection.read
 * for reads; staff.invite | user.activate | branch.create for manage).
 */
@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  listAgents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') search?: string,
    @Query('date') date?: string,
  ) {
    return this.agentsService.listAgents(user, search, date);
  }

  @Get('floats')
  listFloats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.agentsService.listFloatsForDay(user, date);
  }

  @Get(':agentId')
  getAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query('date') date?: string,
  ) {
    return this.agentsService.getAgentDetail(user, agentId, date);
  }

  @Get(':agentId/activity')
  getActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Query('date') date?: string,
    @Query('range') range?: string,
  ) {
    return this.agentsService.getAgentActivity(user, agentId, {
      date,
      range,
    });
  }

  @Patch(':agentId/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: UpdateAgentStatusDto,
  ) {
    return this.agentsService.updateAgentStatus(user, agentId, dto);
  }

  @Post(':agentId/floats')
  recordFloat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: RecordAgentFloatDto,
  ) {
    return this.agentsService.recordFloat(user, agentId, dto);
  }
}
