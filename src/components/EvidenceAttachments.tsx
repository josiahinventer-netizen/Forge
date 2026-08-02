import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, now, uid } from '../database/db';
import { prepareEvidenceImage } from '../services/imageEvidence';
import {
  EVIDENCE_KINDS,
  VERIFICATION_STATUSES,
  type EvidenceKind,
  type EvidenceOwnerType,
  type VerificationStatus,
} from '../types/models';
import { Field } from './UI';

export function EvidenceAttachments({
  ownerType,
  ownerId,
  ownerName,
  saved,
}: {
  ownerType: EvidenceOwnerType;
  ownerId: string;
  ownerName: string;
  saved: boolean;
}) {
  const [kind, setKind] = useState<EvidenceKind>(
    ownerType === 'resource'
      ? 'Item photo'
      : ownerType === 'activity' || ownerType === 'skill'
        ? 'Project result'
        : 'Other',
  );
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    ownerType === 'resource' ? 'Confirmed' : 'Activity-supported',
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const attachments =
    useLiveQuery(
      () =>
        saved
          ? db.attachments
              .where('ownerId')
              .equals(ownerId)
              .filter((item) => item.ownerType === ownerType && !item.archived)
              .toArray()
          : [],
      [ownerType, ownerId, saved],
    ) ?? [];
  if (!saved) return <p className="muted">Save this record before adding photo evidence.</p>;
  return (
    <fieldset>
      <legend>Photo evidence</legend>
      <p className="muted">
        Take a focused photo of the result, item, label, receipt, certificate, or condition. Forge
        stores a resized copy and its evidence status.
      </p>
      <div className="form-grid">
        <Field label="Evidence type">
          <select value={kind} onChange={(event) => setKind(event.target.value as EvidenceKind)}>
            {EVIDENCE_KINDS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
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
      </div>
      <Field label="What does this photo show?">
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Describe the observable evidence and its source."
        />
      </Field>
      <Field label="Take or choose photo">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setBusy(true);
            setMessage('');
            try {
              const image = await prepareEvidenceImage(file);
              const duplicate = await db.attachments
                .where('sha256')
                .equals(image.sha256)
                .filter(
                  (item) =>
                    item.ownerType === ownerType && item.ownerId === ownerId && !item.archived,
                )
                .first();
              if (duplicate) throw new Error('This photo is already attached to this record.');
              const timestamp = now();
              await db.attachments.put({
                id: uid(),
                ownerType,
                ownerId,
                kind,
                fileName: file.name || `${ownerType}-evidence.jpg`,
                ...image,
                verificationStatus,
                notes: notes.trim(),
                createdAt: timestamp,
                updatedAt: timestamp,
                tags: [],
                archived: false,
              });
              setNotes('');
              setMessage('Photo evidence saved.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Could not add photo evidence.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </Field>
      {busy && (
        <p role="status" className="muted">
          Resizing and checking photo…
        </p>
      )}
      {message && (
        <p role="status" className="evidence">
          {message}
        </p>
      )}
      {attachments.length > 0 && (
        <div className="evidence-gallery">
          {attachments.map((attachment) => (
            <figure key={attachment.id}>
              <img src={attachment.dataUrl} alt={`${attachment.kind} for ${ownerName}`} />
              <figcaption>
                <strong>{attachment.kind}</strong>
                <span>
                  {attachment.verificationStatus} · {Math.round(attachment.byteSize / 1024)} KB
                </span>
                {attachment.notes && <small>{attachment.notes}</small>}
                <button
                  type="button"
                  className="danger subtle"
                  onClick={async () => {
                    if (
                      !confirm(
                        'Archive this photo evidence? It will remain in exports and synchronized data.',
                      )
                    )
                      return;
                    await db.attachments.update(attachment.id, {
                      archived: true,
                      updatedAt: now(),
                    });
                  }}
                >
                  Archive photo
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </fieldset>
  );
}
