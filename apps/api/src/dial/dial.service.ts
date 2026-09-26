import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  DialTask, DialTaskItem, CallRecord, LeadCase, LeadIdentity, CaseActivity, ScriptStar,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';
import { getCallProviderMode, startCall } from './call-provider';

@Injectable()
export class DialService {
  constructor(
    @InjectRepository(DialTask) private readonly tasks: Repository<DialTask>,
    @InjectRepository(DialTaskItem) private readonly items: Repository<DialTaskItem>,
    @InjectRepository(CallRecord) private readonly calls: Repository<CallRecord>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    @InjectRepository(LeadIdentity) private readonly identities: Repository<LeadIdentity>,
    @InjectRepository(CaseActivity) private readonly activities: Repository<CaseActivity>,
    @InjectRepository(ScriptStar) private readonly stars: Repository<ScriptStar>,
    private readonly events: EventsService,
    private readonly dataSource: DataSource,
  ) {}

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
  }

  async listTasks(user: AuthUser) {
    return this.tasks.find({
      where: { tenant_id: user.tenant_id },
      order: { created_at: 'DESC' },
    });
  }

  async createTask(user: AuthUser, body: {
    name: string; description?: string; due_at?: string; case_ids?: string[];
  }) {
    if (!this.isAdmin(user)) throw new ForbiddenException('仅经理可创建外呼任务包');
    if (!body.name?.trim()) throw new BadRequestException('任务名称必填');
    const caseIds = Array.isArray(body.case_ids) ? body.case_ids.filter(Boolean) : [];
    const task = await this.tasks.save(this.tasks.create({
      tenant_id: user.tenant_id,
      name: body.name.trim(),
      description: body.description || null,
      created_by: user.sub,
      due_at: body.due_at ? new Date(body.due_at) : null,
      status: 'open',
      total_items: caseIds.length,
      done_items: 0,
    }));
    for (const cid of caseIds) {
      const c = await this.cases.findOne({ where: { id: cid, tenant_id: user.tenant_id } });
      if (!c) continue;
      await this.items.save(this.items.create({
        tenant_id: user.tenant_id,
        task_id: task.id,
        case_id: c.id,
        status: 'pending',
      }));
    }
    task.total_items = await this.items.count({ where: { task_id: task.id } });
    await this.tasks.save(task);
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'dial_task.create',
      resource_type: 'DialTask', resource_id: task.id, detail: { total: task.total_items },
    });
    return task;
  }

  async getTask(user: AuthUser, id: string) {
    const task = await this.tasks.findOne({ where: { id, tenant_id: user.tenant_id } });
    if (!task) throw new NotFoundException('任务不存在');
    const items = await this.items.find({ where: { task_id: id }, order: { created_at: 'ASC' } });
    return {
      task,
      items,
      completion_rate: task.total_items ? Math.round((task.done_items / task.total_items) * 100) : 0,
      call_provider: getCallProviderMode(),
    };
  }

  /** Seat claims next pending item (atomic). */
  async nextItem(user: AuthUser, taskId: string) {
    if (!user.agent_seat_id) throw new BadRequestException('缺少坐席身份');
    const task = await this.tasks.findOne({ where: { id: taskId, tenant_id: user.tenant_id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'open') throw new BadRequestException('任务已关闭');

    const claimed = await this.dataSource.transaction(async (manager) => {
      const item = await manager
        .createQueryBuilder(DialTaskItem, 'i')
        .setLock('pessimistic_write')
        .where('i.task_id = :tid AND i.tenant_id = :tenant AND i.status = :st', {
          tid: taskId, tenant: user.tenant_id, st: 'pending',
        })
        .orderBy('i.created_at', 'ASC')
        .getOne();
      if (!item) return null;
      item.status = 'claimed';
      item.claimed_by_seat_id = user.agent_seat_id!;
      item.claimed_at = new Date();
      await manager.save(item);
      return item;
    });

    if (!claimed) return { item: null, message: '队列已空' };
    const c = await this.cases.findOne({ where: { id: claimed.case_id } });
    const idn = c ? await this.identities.findOne({ where: { id: c.identity_id } }) : null;
    return {
      item: claimed,
      case: c ? { id: c.id, stage: c.stage, product_code: c.product_code } : null,
      identity: idn ? {
        name: idn.name,
        phone: idn.phone,
        company_name: idn.company_name,
      } : null,
      call_provider: getCallProviderMode(),
    };
  }

  async submitResult(user: AuthUser, itemId: string, body: {
    result: string; note?: string; start_call?: boolean;
  }) {
    const item = await this.items.findOne({ where: { id: itemId, tenant_id: user.tenant_id } });
    if (!item) throw new NotFoundException('任务项不存在');
    if (!this.isAdmin(user) && item.claimed_by_seat_id !== user.agent_seat_id) {
      throw new ForbiddenException('只能回写自己领取的号码');
    }
    const allowed = ['no_answer', 'connected', 'callback', 'rejected', 'invalid'];
    if (!allowed.includes(body.result)) {
      throw new BadRequestException(`result 须为: ${allowed.join('/')}`);
    }

    let callRecord: CallRecord | null = null;
    if (body.start_call !== false) {
      const c = await this.cases.findOne({ where: { id: item.case_id } });
      const idn = c ? await this.identities.findOne({ where: { id: c.identity_id } }) : null;
      const started = await startCall({
        case_id: item.case_id,
        tenant_id: user.tenant_id,
        dial_item_id: item.id,
        to_phone: idn?.phone || null,
      });
      if (!started.ok) {
        throw new BadRequestException(started.error || '外呼失败');
      }
      callRecord = await this.calls.save(this.calls.create({
        tenant_id: user.tenant_id,
        case_id: item.case_id,
        dial_item_id: item.id,
        provider: started.provider,
        mode: started.mode,
        duration_sec: started.duration_sec,
        recording_url: started.recording_url,
        result: body.result,
        meta: started.meta,
      }));
      await this.activities.save(this.activities.create({
        tenant_id: user.tenant_id,
        case_id: item.case_id,
        actor_user_id: user.sub,
        kind: 'call',
        body: `外呼结果 ${body.result}${body.note ? ` · ${body.note}` : ''} · ${started.mode.toUpperCase()}`,
        meta: {
          call_record_id: callRecord.id,
          recording_url: callRecord.recording_url,
          duration_sec: callRecord.duration_sec,
          mode: callRecord.mode,
          dial_item_id: item.id,
        },
      }));
      if (c) {
        c.last_touch_at = new Date();
        await this.cases.save(c);
      }
    }

    item.result = body.result;
    item.note = body.note || null;
    item.status = 'done';
    item.call_record_id = callRecord?.id || null;
    await this.items.save(item);

    const task = await this.tasks.findOne({ where: { id: item.task_id } });
    if (task) {
      task.done_items = await this.items.count({ where: { task_id: task.id, status: 'done' } });
      if (task.done_items >= task.total_items && task.total_items > 0) task.status = 'done';
      await this.tasks.save(task);
    }

    return { item, call_record: callRecord, call_provider: getCallProviderMode() };
  }

  async startStandaloneCall(user: AuthUser, body: { case_id: string; result?: string }) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止外呼');
    const c = await this.cases.findOne({ where: { id: body.case_id, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');
    const idn = await this.identities.findOne({ where: { id: c.identity_id } });
    const started = await startCall({
      case_id: c.id,
      tenant_id: user.tenant_id,
      to_phone: idn?.phone || null,
    });
    if (!started.ok) throw new BadRequestException(started.error || '外呼失败');
    const result = body.result || started.result;
    const callRecord = await this.calls.save(this.calls.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      provider: started.provider,
      mode: started.mode,
      duration_sec: started.duration_sec,
      recording_url: started.recording_url,
      result,
      meta: started.meta,
    }));
    await this.activities.save(this.activities.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      actor_user_id: user.sub,
      kind: 'call',
      body: `通话 ${result} · ${started.mode.toUpperCase()} · ${started.duration_sec || 0}s`,
      meta: {
        call_record_id: callRecord.id,
        recording_url: callRecord.recording_url,
        duration_sec: callRecord.duration_sec,
        mode: callRecord.mode,
      },
    }));
    c.last_touch_at = new Date();
    await this.cases.save(c);
    return { call_record: callRecord, call_provider: getCallProviderMode() };
  }

  async listCalls(user: AuthUser, caseId: string) {
    return this.calls.find({
      where: { tenant_id: user.tenant_id, case_id: caseId },
      order: { created_at: 'DESC' },
    });
  }

  async starCall(user: AuthUser, callId: string, body: { script_id?: string; scene?: string; note?: string }) {
    const call = await this.calls.findOne({ where: { id: callId, tenant_id: user.tenant_id } });
    if (!call) throw new NotFoundException('通话记录不存在');
    call.starred = true;
    call.starred_script_id = body.script_id || null;
    await this.calls.save(call);
    let star = await this.stars.findOne({ where: { call_record_id: callId, tenant_id: user.tenant_id } });
    if (!star) {
      star = this.stars.create({
        tenant_id: user.tenant_id,
        call_record_id: callId,
        script_id: body.script_id || null,
        scene: body.scene || null,
        starred_by: user.sub,
        note: body.note || null,
      });
    } else {
      star.script_id = body.script_id || star.script_id;
      star.scene = body.scene || star.scene;
      star.note = body.note || star.note;
    }
    await this.stars.save(star);
    return { call, star };
  }

  async listStarred(user: AuthUser) {
    return this.calls.find({
      where: { tenant_id: user.tenant_id, starred: true },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  providerStatus() {
    return {
      call_provider: getCallProviderMode(),
      real_call_enabled: process.env.REAL_CALL_ENABLED === 'true',
      hint: getCallProviderMode() === 'mock'
        ? '当前 MOCK：演示写假通话与录音占位 URL'
        : '当前 REAL：无密钥时失败关闭',
    };
  }
}
