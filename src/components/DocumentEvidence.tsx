import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, now, uid } from '../database/db';
import {
  DOCUMENT_EVIDENCE_SOURCE_TYPES,
  VERIFICATION_STATUSES,
  type DocumentEvidenceSourceType,
  type EvidenceOwnerType,
  type VerificationStatus,
} from '../types/models';
import { Field } from './UI';

export function DocumentEvidence({
  ownerType,
  ownerId,
  saved,
}: {
  ownerType: EvidenceOwnerType;
  ownerId: string;
  saved: boolean;
}) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<DocumentEvidenceSourceType>('Personal note');
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [notes, setNotes] = useState('');
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>('Document-supported');
  const [message, setMessage] = useState('');
  const records =
    useLiveQuery(
      () =>
        saved
          ? db.documentEvidence
              .where('ownerId')
              .equals(ownerId)
              .filter((item) => item.ownerType === ownerType && !item.archived)
              .reverse()
              .sortBy('updatedAt')
          : [],
      [ownerType, ownerId, saved],
    ) ?? [];

  if (!saved) return <p className="muted">Save this record before adding document evidence.</p>;

  return (
    <fieldset>
      <legend>Document evidence</legend>
      <p className="muted">
        Attribute claims to a resume, course, certificate, manual, receipt, web page, or note. Forge
        stores the citation and excerpt, not the source file itself.
      </p>
      <div className="form-grid">
        <Field label="Evidence title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Source type">
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as DocumentEvidenceSourceType)}
          >
            {DOCUMENT_EVIDENCE_SOURCE_TYPES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Source or issuer">
          <input
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="Oregon Tech, manufacturer, employer…"
          />
        </Field>
        <Field label="Evidence status">
          <select
            value={verificationStatus}
            onChange={(event) => setVerificationStatus(event.target.value as VerificationStatus)}
          >
            {VERIFICATION_STATUSES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Source link (optional)">
          <input
            type="url"
            inputMode="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Issued or observed date (optional)">
          <input
            type="date"
            value={issuedAt}
            onChange={(event) => setIssuedAt(event.target.value)}
          />
        </Field>
      </div>
      <Field label="Relevant excerpt or fact">
        <textarea
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
          placeholder="Record the exact fact this source supports."
        />
      </Field>
      <Field label="Interpretation or limits (optional)">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Explain uncertainty, context, or what this does not prove."
        />
      </Field>
      <button
        type="button"
        disabled={!title.trim() || !sourceName.trim() || !excerpt.trim()}
        onClick={async () => {
          const normalizedUrl = sourceUrl.trim();
          if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
            setMessage('Source links must begin with https:// or http://.');
            return;
          }
          const timestamp = now();
          await db.documentEvidence.add({
            id: uid(),
            ownerType,
            ownerId,
            title: title.trim(),
            sourceType,
            sourceName: sourceName.trim(),
            sourceUrl: normalizedUrl || undefined,
            issuedAt: issuedAt ? new Date(`${issuedAt}T00:00:00`).toISOString() : undefined,
            excerpt: excerpt.trim(),
            notes: notes.trim(),
            verificationStatus,
            createdAt: timestamp,
            updatedAt: timestamp,
            tags: [],
            archived: false,
          });
          setTitle('');
          setSourceName('');
          setSourceUrl('');
          setIssuedAt('');
          setExcerpt('');
          setNotes('');
          setMessage('Document evidence saved.');
        }}
      >
        Add document evidence
      </button>
      {message && (
        <p role="status" className="evidence">
          {message}
        </p>
      )}
      {records.length > 0 && (
        <div className="record-list">
          {records.map((record) => (
            <article className="record-row" key={record.id}>
              <div>
                <strong>{record.title}</strong>
                <p className="muted">
                  {record.sourceType} · {record.sourceName} · {record.verificationStatus}
                  {record.issuedAt ? ` · ${new Date(record.issuedAt).toLocaleDateString()}` : ''}
                </p>
                <p>{record.excerpt}</p>
                {record.notes && <p className="muted">Limits: {record.notes}</p>}
                {record.sourceUrl && (
                  <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                )}
              </div>
              <button
                type="button"
                className="danger subtle"
                onClick={async () => {
                  if (
                    !confirm('Archive this document evidence? It will remain in exported history.')
                  )
                    return;
                  await db.documentEvidence.update(record.id, {
                    archived: true,
                    updatedAt: now(),
                  });
                }}
              >
                Archive evidence
              </button>
            </article>
          ))}
        </div>
      )}
    </fieldset>
  );
}
