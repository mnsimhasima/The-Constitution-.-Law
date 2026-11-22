import { CheckCircle2, Plus, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { StaffActor } from '../../hooks/useBackendStore';
import type {
  AuditLogEntry,
  CmsBook,
  SourceRightRecord,
  StaffRole,
  SystemSettingsRecord,
} from '../../types/backend';
import type { LanguageCode } from '../../types/library';
import {
  canEditSourcesRights,
  canManageSettings,
  canVerifySourcesRights,
} from '../../utils/rbacLogic';

interface AdminGovernancePanelProps {
  mode: 'edit-log' | 'sources-rights' | 'settings';
  activeRole: StaffRole;
  actor: StaffActor;
  cmsBooks: CmsBook[];
  auditLogs: AuditLogEntry[];
  sourcesRights: SourceRightRecord[];
  systemSettings: SystemSettingsRecord;
  onUpsertSourceRight: (record: SourceRightRecord, actor: StaffActor) => void;
  onUpdateSettings: (updates: Partial<SystemSettingsRecord>, actor: StaffActor) => void;
}

export function AdminGovernancePanel({
  mode,
  activeRole,
  actor,
  cmsBooks,
  auditLogs,
  sourcesRights,
  systemSettings,
  onUpsertSourceRight,
  onUpdateSettings,
}: AdminGovernancePanelProps) {
  const canEditSources = canEditSourcesRights(activeRole);
  const canVerifySources = canVerifySourcesRights(activeRole);
  const canEditSettings = canManageSettings(activeRole);

  // Edit Log filter
  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all');

  // Sources & Rights form
  const [srcBookId, setSrcBookId] = useState(cmsBooks[0]?.id ?? '');
  const [srcName, setSrcName] = useState('');
  const [srcLicense, setSrcLicense] = useState('Government Work — Public Domain');
  const [srcJurisdiction, setSrcJurisdiction] = useState('Republic of India');
  const [srcUrl, setSrcUrl] = useState('https://legislative.gov.in');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // =========================================================================
  // VIEW 1: IMMUTABLE EDIT LOG
  // =========================================================================
  if (mode === 'edit-log') {
    const filteredLogs = auditLogs.filter((l) =>
      roleFilter === 'all' ? true : l.actorRole === roleFilter
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Edit Log &amp; Audit Trail</h1>
            <p className="text-xs text-slate-500">
              Immutable chronological log of every upload, bulk import, review decision, role change, and ticket resolution.
            </p>
          </div>
          <select
            aria-label="Filter edit log by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | StaffRole)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <option value="all">All Staff Roles</option>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="reviewer">Reviewer</option>
            <option value="security">Security</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-3 py-3">Actor &amp; Role</th>
                <th className="px-3 py-3">Action</th>
                <th className="px-5 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-mono text-[11px] tabular-nums text-slate-500 whitespace-nowrap">
                    {log.createdAt.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-900">{log.actorEmail}</p>
                    <p className="font-mono text-[10px] uppercase text-blue-600">{log.actorRole}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] font-semibold text-slate-700">
                    {log.action}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: SOURCES & RIGHTS
  // =========================================================================
  if (mode === 'sources-rights') {
    const handleAddSource = (e: React.FormEvent) => {
      e.preventDefault();
      if (!canEditSources || !srcName.trim()) return;
      const book = cmsBooks.find((b) => b.id === srcBookId);
      const nowIso = new Date().toISOString();
      onUpsertSourceRight(
        {
          id: `src-${Date.now().toString(36)}`,
          bookId: book?.id ?? 'general',
          bookTitle: book?.shortTitle ?? 'Library Publication',
          sourceName: srcName.trim(),
          licenseType: srcLicense.trim(),
          jurisdiction: srcJurisdiction.trim(),
          citationUrl: srcUrl.trim(),
          verified: activeRole === 'admin',
          updatedBy: actor.email,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        actor
      );
      setSrcName('');
      setSavedNotice('Added source & rights citation record.');
    };

    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-950">Sources &amp; Rights Registry</h1>
          <p className="text-xs text-slate-500">
            Track official legal gazette citations, public-domain attestations, and publishing rights for every book.
          </p>
        </div>

        {savedNotice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            {savedNotice}
          </div>
        )}

        {canEditSources && (
          <form
            onSubmit={handleAddSource}
            className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-5"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Book</label>
              <select
                value={srcBookId}
                onChange={(e) => setSrcBookId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs"
              >
                {cmsBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Official Source *</label>
              <input
                required
                value={srcName}
                onChange={(e) => setSrcName(e.target.value)}
                placeholder="Gazette of India / Ministry of Law"
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">License / Rights</label>
              <input
                value={srcLicense}
                onChange={(e) => setSrcLicense(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700">Jurisdiction</label>
              <input
                value={srcJurisdiction}
                onChange={(e) => setSrcJurisdiction(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-2.5 text-xs"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Citation
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                <th className="px-5 py-3">Book</th>
                <th className="px-3 py-3">Source Attribution</th>
                <th className="px-3 py-3">License &amp; Jurisdiction</th>
                <th className="px-5 py-3 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sourcesRights.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-semibold text-slate-950">{rec.bookTitle}</td>
                  <td className="px-3 py-3.5 text-slate-700">{rec.sourceName}</td>
                  <td className="px-3 py-3.5 text-slate-600">
                    {rec.licenseType} · {rec.jurisdiction}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {rec.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Verified
                      </span>
                    ) : canVerifySources ? (
                      <button
                        type="button"
                        onClick={() => onUpsertSourceRight({ ...rec, verified: true }, actor)}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Mark Verified
                      </button>
                    ) : (
                      <span className="text-[11px] text-amber-700">Pending Verification</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: SYSTEM SETTINGS (Admin Only)
  // =========================================================================
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-950">Backend System Settings</h1>
        <p className="text-xs text-slate-500">
          Configure publishing governance, community AI moderation, and enabled bulk import formats.
        </p>
      </div>

      {savedNotice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">
          {savedNotice}
        </div>
      )}

      <div className="max-w-2xl divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {[
          {
            key: 'requireReviewBeforePublish' as const,
            title: 'Require Reviewer Approval Before Publishing',
            desc: 'When enabled, books uploaded or bulk-imported by Editors stay in Pending Review until approved by a Reviewer or Admin.',
          },
          {
            key: 'strictCommunityModeration' as const,
            title: 'Strict AI & Profanity Community Filtering',
            desc: 'Rejects profanity, links/non-text content, and off-topic posts in the mobile Studio Community feed.',
          },
          {
            key: 'allowJsonImport' as const,
            title: 'Enable Bulk JSON Imports',
            desc: 'Allow Admin and Editor roles to upload structured JSON book bundles.',
          },
          {
            key: 'allowCsvImport' as const,
            title: 'Enable Bulk CSV Imports',
            desc: 'Allow tabular CSV uploads with automatic book & chapter grouping.',
          },
          {
            key: 'allowExcelImport' as const,
            title: 'Enable Bulk Excel (.xlsx) Imports',
            desc: 'Allow Excel spreadsheet book uploads via read-excel-file.',
          },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.desc}</p>
            </div>
            <button
              type="button"
              disabled={!canEditSettings}
              onClick={() => {
                onUpdateSettings({ [item.key]: !systemSettings[item.key] }, actor);
                setSavedNotice(`Saved setting: ${item.title}.`);
              }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition cursor-pointer disabled:opacity-50 ${
                systemSettings[item.key] ? 'bg-[#2563EB]' : 'bg-slate-300'
              }`}
              aria-pressed={systemSettings[item.key]}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  systemSettings[item.key] ? 'translate-x-5.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-semibold text-slate-950">Default Mobile Library Language</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Primary default language for newly onboarded mobile readers.
            </p>
          </div>
          <select
            disabled={!canEditSettings}
            value={systemSettings.defaultLanguage}
            onChange={(e) => {
              onUpdateSettings({ defaultLanguage: e.target.value as LanguageCode }, actor);
              setSavedNotice('Updated default library language.');
            }}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
          >
            <option value="en">English (EN)</option>
            <option value="te">Telugu (తెలుగు)</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="es">Spanish (ES)</option>
            <option value="fr">French (FR)</option>
            <option value="ar">Arabic (AR)</option>
          </select>
        </div>

        <div className="flex items-center justify-between bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Last updated by {systemSettings.updatedBy}
          </span>
          <span className="font-mono">{systemSettings.updatedAt.slice(0, 16).replace('T', ' ')}</span>
        </div>
      </div>
    </div>
  );
}
