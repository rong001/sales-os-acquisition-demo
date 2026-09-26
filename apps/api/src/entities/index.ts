import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', nullable: true, unique: true }) slug!: string | null;
  @Column('text', { array: true, default: '{}' }) mode_flags!: string[];
  @Column({ type: 'varchar', default: 'Asia/Shanghai' }) timezone!: string;
  @Column({ type: 'varchar', default: 'zh-CN' }) locale!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('users')
@Index(['tenant_id', 'email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) email!: string;
  @Column({ type: 'varchar' }) password_hash!: string;
  @Column({ type: 'varchar' }) display_name!: string;
  @Column({ type: 'varchar', default: 'agent' }) role!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('skill_groups')
export class SkillGroup {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column('text', { array: true, default: '{}' }) skills!: string[];
  @Column({ type: 'int', default: 50 }) max_in_progress!: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('agent_seats')
@Index(['tenant_id', 'user_id'], { unique: true })
export class AgentSeat {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid', { nullable: true }) skill_group_id!: string | null;
  @Column({ default: true }) online!: boolean;
  @Column({ type: 'int', default: 0 }) current_load!: number;
  @Column({ nullable: true, default: 'day' }) shift!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('lead_identities')
@Index(['tenant_id', 'merge_key'], { unique: true })
export class LeadIdentity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar', nullable: true }) phone!: string | null;
  @Column({ type: 'varchar', nullable: true }) wechat_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) email!: string | null;
  @Column({ type: 'varchar', nullable: true }) name!: string | null;
  @Column({ type: 'varchar', nullable: true }) company_name!: string | null;
  @Column({ type: 'varchar' }) merge_key!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('lead_sources')
export class LeadSource {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) type!: string;
  @Column({ type: 'varchar', nullable: true }) campaign!: string | null;
  @Column({ type: 'varchar', nullable: true }) adset!: string | null;
  @Column({ type: 'varchar', nullable: true }) creative!: string | null;
  @Column({ type: 'text', nullable: true }) landing_url!: string | null;
  @Column({ type: 'varchar', nullable: true }) form_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) import_batch_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_source!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_medium!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_campaign!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_content!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_term!: string | null;
  @Column({ type: 'varchar', nullable: true }) invite_code!: string | null;
  @Column({ type: 'varchar', nullable: true }) product_code!: string | null;
  @Column({ type: 'jsonb', nullable: true }) raw_payload!: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('lead_cases')
@Index(['tenant_id', 'stage'])
export class LeadCase {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') identity_id!: string;
  @Column('uuid', { nullable: true }) source_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) scene_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) product_code!: string | null;
  @Column({ type: 'varchar', default: 'STANDARD' }) path!: string;
  @Column({ type: 'varchar', default: 'NEW' }) stage!: string;
  @Column('uuid', { nullable: true }) owner_agent_id!: string | null;
  @Column('uuid', { nullable: true }) skill_group_id!: string | null;
  @Column({ type: 'jsonb', default: {} }) flags!: Record<string, unknown>;
  @Column({ type: 'varchar', default: 'unknown' }) intent_level!: string;
  @Column({ default: false }) intent_qualified!: boolean;
  /** 下次跟进到期时间（站内待办；非 SMS/Call 送达） */
  @Column({ type: 'timestamptz', nullable: true }) next_follow_at!: Date | null;
  /** open=待处理；handled=已处理（不再出现在到期列表） */
  @Column({ type: 'varchar', nullable: true, default: null }) follow_up_status!: string | null;
  /** private=私海；public=公海可领 */
  @Column({ type: 'varchar', default: 'public' }) sea_status!: string;
  @Column({ type: 'timestamptz', nullable: true }) protected_until!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) last_touch_at!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('consent_grants')
export class ConsentGrant {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') identity_id!: string;
  @Column('uuid', { nullable: true }) case_id!: string | null;
  @Column({ type: 'varchar' }) channel!: string;
  @Column({ type: 'varchar', default: 'unknown' }) status!: string;
  @Column({ type: 'text', nullable: true }) evidence_ref!: string | null;
  @Column({ type: 'text', nullable: true }) consent_text!: string | null;
  @Column({ type: 'varchar', nullable: true }) consent_text_hash!: string | null;
  @Column({ type: 'varchar', nullable: true }) consent_version!: string | null;
  @Column({ type: 'varchar', nullable: true }) source_channel!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) consent_accepted_at!: Date | null;
  @Column({ type: 'varchar', nullable: true }) ip!: string | null;
  @Column({ type: 'text', nullable: true }) user_agent!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) granted_at!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) expires_at!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('ownerships')
export class Ownership {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column('uuid') agent_id!: string;
  @Column({ type: 'varchar' }) reason!: string;
  @Column({ type: 'timestamptz', nullable: true }) protect_until!: Date | null;
  @Column({ type: 'varchar', default: 'active' }) status!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('pool_items')
export class PoolItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'varchar' }) reason!: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) claimable_from!: Date;
  @Column('uuid', { nullable: true }) last_owner_id!: string | null;
  @Column({ type: 'varchar', default: 'open' }) status!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('reach_plans')
export class ReachPlan {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'jsonb', default: [] }) sequence!: unknown[];
  @Column({ type: 'jsonb', nullable: true }) parallel_group!: unknown | null;
  @Column({ type: 'varchar', default: 'active' }) status!: string;
  @Column({ type: 'int', default: 1 }) version!: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('reach_attempts')
export class ReachAttempt {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid', { nullable: true }) plan_id!: string | null;
  @Column('uuid') case_id!: string;
  @Column({ type: 'varchar' }) channel!: string;
  @Column({ type: 'varchar', nullable: true }) executor_ref!: string | null;
  @Column({ type: 'varchar', nullable: true }) template_ref!: string | null;
  @Column({ type: 'varchar', default: 'queued' }) status!: string;
  @Column({ type: 'varchar', nullable: true }) provider_msg_id!: string | null;
  /** Always true unless REAL_SMS_ENABLED / REAL_CALL_ENABLED + credentials */
  @Column({ default: true }) is_mock!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) started_at!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) ended_at!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('reach_receipts')
export class ReachReceipt {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') attempt_id!: string;
  @Column({ type: 'varchar', nullable: true }) raw_status!: string | null;
  @Column({ type: 'varchar' }) result_code!: string;
  @Column({ type: 'int', nullable: true }) talk_seconds!: number | null;
  @Column({ type: 'text', nullable: true }) transcript_ref!: string | null;
  @Column({ default: true }) is_mock!: boolean;
  @Column({ type: 'timestamptz', default: () => 'now()' }) received_at!: Date;
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'timestamptz', nullable: true }) slot_start!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) slot_end!: Date | null;
  @Column({ type: 'text', nullable: true }) location_or_link!: string | null;
  @Column({ type: 'varchar', nullable: true }) product_or_program!: string | null;
  @Column('uuid', { nullable: true }) owner_agent_id!: string | null;
  @Column({ type: 'varchar', default: 'draft' }) status!: string;
  @Column({ default: false }) valid!: boolean;
  @Column({ type: 'varchar', nullable: true }) amount_hint!: string | null;
  @Column({ type: 'text', nullable: true }) cancel_policy!: string | null;
  @Column({ type: 'text', nullable: true }) commitment_boundary!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @Column({ type: 'timestamptz', nullable: true }) confirmed_at!: Date | null;
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column('uuid', { nullable: true }) appointment_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) offer_ref!: string | null;
  @Column({ type: 'varchar', nullable: true }) amount!: string | null;
  @Column({ type: 'varchar', default: 'CNY' }) currency!: string;
  @Column({ type: 'varchar', default: 'draft' }) status!: string;
  @Column({ default: false }) valid!: boolean;
  @Column({ type: 'jsonb', default: [] }) evidence_refs!: unknown[];
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('case_activities')
@Index(['tenant_id', 'case_id', 'created_at'])
export class CaseActivity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column('uuid', { nullable: true }) actor_user_id!: string | null;
  @Column({ type: 'varchar', default: 'note' }) kind!: string;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'jsonb', default: {} }) meta!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('domain_events')
export class DomainEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid', { nullable: true }) case_id!: string | null;
  @Column({ type: 'varchar' }) type!: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) occurred_at!: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) received_at!: Date;
  @Column({ type: 'varchar', default: 'system' }) actor!: string;
  @Column('uuid', { nullable: true }) correlation_id!: string | null;
  @Column('uuid', { nullable: true }) causation_id!: string | null;
  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, unknown>;
  @Column({ type: 'int', default: 1 }) version!: number;
}

@Entity('outbox')
export class Outbox {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) aggregate_type!: string;
  @Column('uuid') aggregate_id!: string;
  @Column({ type: 'varchar' }) event_type!: string;
  @Column({ type: 'jsonb' }) payload!: Record<string, unknown>;
  @Column({ type: 'varchar', default: 'pending' }) status!: string;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @Column({ type: 'timestamptz', nullable: true }) published_at!: Date | null;
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid', { nullable: true }) actor_user_id!: string | null;
  @Column({ type: 'varchar' }) action!: string;
  @Column({ type: 'varchar', nullable: true }) resource_type!: string | null;
  @Column('uuid', { nullable: true }) resource_id!: string | null;
  @Column({ type: 'jsonb', default: {} }) detail!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}


@Entity('content_pages')
@Index(['tenant_id', 'slug'], { unique: true })
export class ContentPage {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) slug!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'varchar', nullable: true }) description!: string | null;
  @Column({ type: 'text' }) body!: string;
  @Column({ type: 'varchar', nullable: true }) product_code!: string | null;
  @Column({ default: true }) published!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('channel_links')
@Index(['tenant_id', 'code'], { unique: true })
export class ChannelLink {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) code!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', default: 'ticket-grab' }) product_code!: string;
  @Column({ type: 'varchar', nullable: true }) utm_source!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_medium!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_campaign!: string | null;
  @Column({ type: 'varchar', nullable: true }) utm_content!: string | null;
  @Column({ type: 'varchar', nullable: true }) invite_code!: string | null;
  @Column({ type: 'varchar', nullable: true }) landing_path!: string | null;
  @Column({ default: true }) enabled!: boolean;
  @Column({ type: 'int', default: 0 }) hit_count!: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('invite_codes')
@Index(['tenant_id', 'code'], { unique: true })
export class InviteCode {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) code!: string;
  @Column({ type: 'varchar', nullable: true }) label!: string | null;
  @Column({ type: 'varchar', nullable: true }) channel_code!: string | null;
  @Column({ type: 'varchar', nullable: true }) product_code!: string | null;
  @Column({ type: 'int', nullable: true }) max_uses!: number | null;
  @Column({ type: 'int', default: 0 }) use_count!: number;
  @Column({ default: true }) enabled!: boolean;
  @Column({ type: 'timestamptz', nullable: true }) expires_at!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar', default: 'ticket-grab' }) landing_product!: string;
  @Column({ type: 'text', nullable: true }) creative_copy!: string | null;
  @Column({ type: 'varchar', nullable: true }) creative_url!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) starts_at!: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) ends_at!: Date | null;
  @Column({ default: true }) enabled!: boolean;
  @Column({ type: 'varchar', nullable: true }) utm_campaign!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}


@Entity('pool_rules')
@Index(['tenant_id'], { unique: true })
export class PoolRule {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'int', default: 50 }) max_private_cases!: number;
  @Column({ type: 'int', default: 48 }) protect_hours!: number;
  @Column({ type: 'int', default: 7 }) idle_days_to_recycle!: number;
  @Column({ default: true }) enabled!: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('pool_audit_logs')
@Index(['tenant_id', 'created_at'])
export class PoolAuditLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid', { nullable: true }) actor_user_id!: string | null;
  @Column('uuid', { nullable: true }) case_id!: string | null;
  @Column({ type: 'varchar' }) action!: string;
  @Column({ type: 'jsonb', default: {} }) detail!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('contracts')
@Index(['tenant_id', 'case_id'])
export class Contract {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'varchar' }) amount!: string;
  @Column({ type: 'varchar', default: 'CNY' }) currency!: string;
  @Column({ type: 'varchar', default: 'draft' }) status!: string;
  @Column({ type: 'timestamptz', nullable: true }) signed_at!: Date | null;
  @Column({ type: 'text', nullable: true }) attachment_url!: string | null;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('payment_plans')
@Index(['tenant_id', 'due_at'])
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') contract_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'timestamptz' }) due_at!: Date;
  @Column({ type: 'varchar' }) amount!: string;
  @Column({ type: 'varchar', default: 'pending' }) status!: string;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('payment_receipts')
@Index(['tenant_id', 'paid_at'])
export class PaymentReceipt {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') contract_id!: string;
  @Column('uuid') case_id!: string;
  @Column('uuid', { nullable: true }) plan_id!: string | null;
  @Column({ type: 'timestamptz' }) paid_at!: Date;
  @Column({ type: 'varchar' }) amount!: string;
  @Column({ type: 'varchar', default: 'transfer' }) method!: string;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('dial_tasks')
@Index(['tenant_id', 'status'])
export class DialTask {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column('uuid', { nullable: true }) created_by!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) due_at!: Date | null;
  @Column({ type: 'varchar', default: 'open' }) status!: string;
  @Column({ type: 'int', default: 0 }) total_items!: number;
  @Column({ type: 'int', default: 0 }) done_items!: number;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('dial_task_items')
@Index(['tenant_id', 'task_id', 'status'])
export class DialTaskItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') task_id!: string;
  @Column('uuid') case_id!: string;
  @Column({ type: 'varchar', default: 'pending' }) status!: string;
  @Column('uuid', { nullable: true }) claimed_by_seat_id!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) claimed_at!: Date | null;
  @Column({ type: 'varchar', nullable: true }) result!: string | null;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @Column('uuid', { nullable: true }) call_record_id!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('call_records')
@Index(['tenant_id', 'case_id'])
export class CallRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') case_id!: string;
  @Column('uuid', { nullable: true }) dial_item_id!: string | null;
  @Column({ type: 'varchar', default: 'mock' }) provider!: string;
  @Column({ type: 'varchar', default: 'mock' }) mode!: string;
  @Column({ type: 'int', nullable: true }) duration_sec!: number | null;
  @Column({ type: 'text', nullable: true }) recording_url!: string | null;
  @Column({ type: 'varchar', nullable: true }) result!: string | null;
  @Column({ default: false }) starred!: boolean;
  @Column('uuid', { nullable: true }) starred_script_id!: string | null;
  @Column({ type: 'jsonb', default: {} }) meta!: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('sales_scripts')
@Index(['tenant_id', 'scene'])
export class SalesScript {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) scene!: string;
  @Column({ type: 'varchar' }) title!: string;
  @Column({ type: 'text' }) body!: string;
  @Column('text', { array: true, default: '{}' }) tags!: string[];
  @Column({ default: true }) enabled!: boolean;
  @Column('uuid', { nullable: true }) created_by!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
}

@Entity('script_stars')
@Index(['tenant_id', 'call_record_id'], { unique: true })
export class ScriptStar {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column('uuid') call_record_id!: string;
  @Column('uuid', { nullable: true }) script_id!: string | null;
  @Column({ type: 'varchar', nullable: true }) scene!: string | null;
  @Column('uuid', { nullable: true }) starred_by!: string | null;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

@Entity('wecom_link_cache')
@Index(['tenant_id', 'external_userid'], { unique: true })
export class WecomLinkCache {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') tenant_id!: string;
  @Column({ type: 'varchar' }) external_userid!: string;
  @Column({ type: 'varchar', nullable: true }) phone!: string | null;
  @Column('uuid', { nullable: true }) case_id!: string | null;
  @Column({ type: 'jsonb', default: {} }) raw!: Record<string, unknown>;
  @UpdateDateColumn({ type: 'timestamptz' }) updated_at!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) created_at!: Date;
}

export const ALL_ENTITIES = [
  Tenant, User, SkillGroup, AgentSeat, LeadIdentity, LeadSource, LeadCase,
  ConsentGrant, Ownership, PoolItem, ReachPlan, ReachAttempt, ReachReceipt,
  Appointment, Order, CaseActivity, DomainEvent, Outbox, AuditLog,
  ContentPage, ChannelLink, InviteCode, Campaign,
  PoolRule, PoolAuditLog, Contract, PaymentPlan, PaymentReceipt,
  DialTask, DialTaskItem, CallRecord, SalesScript, ScriptStar, WecomLinkCache,
];

export const CONSENT_TEXT_V1 =
  '我已阅读并同意贵司在业务沟通范围内通过电话/短信联系我，了解所咨询产品的服务说明。同意可随时撤回。';
export const CONSENT_VERSION = 'v1.0-2026';
