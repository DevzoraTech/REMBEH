import {
  Body,
  Controller,
  Delete,
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
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto';
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
    @Query('purpose') purpose?: string,
  ) {
    return this.agentsService.listAgents(user, search, date, purpose);
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

  @Get(':agentId/account')
  getAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    return this.agentsService.getAgentAccount(user, agentId);
  }

  @Delete(':agentId/sessions/:sessionId')
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.agentsService.revokeAgentSession(user, agentId, sessionId);
  }

  @Post(':agentId/sessions/revoke-all')
  revokeAllSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    return this.agentsService.revokeAllAgentSessions(user, agentId);
  }

  @Patch(':agentId/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: UpdateAgentStatusDto,
  ) {
    return this.agentsService.updateAgentStatus(user, agentId, dto);
  }

  @Patch(':agentId')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.agentsService.updateAgentProfile(user, agentId, dto);
  }

  @Post(':agentId/floats')
  recordFloat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: RecordAgentFloatDto,
  ) {
    return this.agentsService.recordFloat(user, agentId, dto);
  }

  @Post(':agentId/floats/top-ups')
  topUpFloat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: RecordAgentFloatDto,
  ) {
    return this.agentsService.topUpFloat(user, agentId, dto);
  }
}
