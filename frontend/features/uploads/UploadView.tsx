'use client';

/**
 * MedLoop AI — `/data/upload`, Upload Data.
 *
 * ## Nothing is uploaded here
 *
 * The name is the brief's, and it is slightly wrong: no bytes cross the API. The screen registers an
 * **absolute local directory path**, and the server reads the files where they already are. §3.2 keeps
 * exactly one physical copy of every image — splits and batch membership are database references — and
 * that is what makes a 512 GB laptop a viable host for the whole loop. A browser file picker would
 * copy, so there is no file picker.
 *
 * ## The path is validated by the server, not here
 *
 * The directory must resolve inside `MEDLOOP_ALLOWED_INGEST_ROOTS`. That check is a path-safety
 * boundary, so it lives on the server; this form only checks that the field is non-blank, and renders
 * the server's refusal verbatim when it comes. A client that pre-empted the check with cleverer rules
 * could disagree with the authority and would eventually be wrong in the more dangerous direction.
 *
 * ## Registration is not inspection
 *
 * A registered directory carries an `inspection` state, and until an inspection has run there is
 * nothing to report — no image count, no dimensions, no class distribution. This screen shows that
 * state as the server sends it and never fills the blanks: §2.2 forbids assuming a layout, and §2.3
 * forbids inventing the counts that an inspection would have measured.
 */

import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { FormField } from '@/components/ui/Field';import { Input, Textarea } from '@/components/ui/Input';
import { DefinitionList } from '@/components/ui/KpiTile';
import type { DefinitionItem } from '@/components/ui/KpiTile';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { createUpload, getUpload } from '@/lib/api';
import { DEMO_UPLOADS } from '@/lib/demo/demo-uploads';
import { IS_DEMO } from '@/lib/env';
import { formatDateTime, humaniseEnum } from '@/lib/format';
import { ROUTES } from '@/lib/navigation';
import { useApiAction, useApiQuery } from '@/lib/use-query';
import type { Upload } from '@/types/domain';

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The registration record
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * What was recorded, exactly as recorded.
 *
 * Paths are monospaced and never truncated: a registration record is the provenance answer to
 * "where did this image come from" (§7.1), and a shortened path is not an answer. `dataset_id` reads
 * `Not created yet` rather than `—`, because those are different facts — one means registration has
 * not been turned into a dataset, the other means the field was empty.
 */
function uploadItems(upload: Upload): readonly DefinitionItem[] {
  return [
    { term: 'Registration', value: `#${upload.id}`, mono: true },
    { term: 'Status', value: <StatusPill status={upload.status} /> },
    { term: 'Dataset name', value: upload.dataset_name },
    {
      term: 'Dataset row',
      value:
        upload.dataset_id === null ? (
          <span className="text-content-muted">Not created yet</span>
        ) : (
          <Badge mono>{`#${upload.dataset_id}`}</Badge>
        ),
    },
    { term: 'Image directory', value: upload.image_directory, mono: true },
    {
      term: 'Metadata file',
      value: upload.metadata_file,
      unavailableReason: 'No metadata file was given, so no clinical columns will be read.',
      mono: true,
    },
    {
      term: 'Annotation file',
      value: upload.annotation_file,
      unavailableReason: 'No annotation file was given. Geometry will come from human review only.',
      mono: true,
    },
    {
      term: 'Description',
      value: upload.description,
      unavailableReason: 'No description was recorded.',
    },
    { term: 'Registered', value: formatDateTime(upload.created_at) },
  ];
}

/**
 * The inspection state, printed rather than interpreted.
 *
 * `inspection.state` is a free string: the vocabulary belongs to the ingestion service, and mapping it
 * to a tone here would mean this file deciding which of the server's words count as success. So the
 * state is shown verbatim and the reason is shown as prose — and when the server gives no reason, that
 * is said, not filled in.
 *
 * Nothing an inspection would measure — image count, dimensions, class distribution, duplicate groups
 * — is rendered here. Those figures arrive with the dataset once an inspection has actually run (§2.3).
 */
function InspectionPanel({ upload }: { readonly upload: Upload }): ReactElement {
  return (
    <Panel
      title="Inspection"
      description="Registration records a path. Inspection is what reads the files, and it is a separate step."
      meta={<Badge mono>{upload.inspection.state}</Badge>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-content-primary">{humaniseEnum(upload.inspection.state)}</p>
        {upload.inspection.reason === null ? (
          <p className="text-content-secondary">
            The server returned no reason for this state. Nothing is inferred from that here — an
            inspection either reported something or it did not.
          </p>
        ) : (
          <p className="text-content-secondary">{upload.inspection.reason}</p>
        )}
        <p className="text-content-muted">
          Image counts, dimensions and class distribution are not shown until an inspection has
          measured them. This screen never estimates them from the path.
        </p>
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The form
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Five fields, two of them required.
 *
 * There is no file input. A picker would hand the browser bytes to upload, and uploading is precisely
 * what this screen does not do — the server reads the directory in place.
 */
function RegisterForm({
  onRegistered,
}: {
  readonly onRegistered: (upload: Upload) => void;
}): ReactElement {
  const [datasetName, setDatasetName] = useState('');
  const [directory, setDirectory] = useState('');
  const [metadataFile, setMetadataFile] = useState('');
  const [annotationFile, setAnnotationFile] = useState('');
  const [description, setDescription] = useState('');
  const create = useApiAction(createUpload);

  const ready = datasetName.trim() !== '' && directory.trim() !== '';

  const submit = useCallback(async (): Promise<void> => {
    const result = await create.run({
      dataset_name: datasetName.trim(),
      image_directory: directory.trim(),
      // Omitted rather than sent blank: `''` records "an empty metadata file was given", which is a
      // different claim from "none was given".
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(metadataFile.trim() === '' ? {} : { metadata_file: metadataFile.trim() }),
      ...(annotationFile.trim() === '' ? {} : { annotation_file: annotationFile.trim() }),
    });
    if (result === null) return;
    setDatasetName('');
    setDirectory('');
    setMetadataFile('');
    setAnnotationFile('');
    setDescription('');
    onRegistered(result);
  }, [create, datasetName, directory, description, metadataFile, annotationFile, onRegistered]);

  return (
    <Panel
      title="Register a directory"
      description="An absolute path on this machine. The server reads the images where they are — nothing is copied and nothing is moved."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-content-secondary">
            The path must resolve inside the configured ingest roots. The server enforces that.
          </p>
          <Button
            variant="primary"
            onClick={() => void submit()}
            busy={create.busy}
            busyLabel="Registering the directory"
            disabled={!ready}
          >
            Register
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {create.error !== null ? (
          <Alert tone="danger" title="The directory was not registered" live>
            {create.error.message}
          </Alert>
        ) : null}
        <FormField label="Dataset name" required hint="Shown everywhere this data is referenced.">
          <Input
            value={datasetName}
            onChange={(event) => setDatasetName(event.target.value)}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Image directory"
          required
          hint="Absolute path. Read in place — the images are never copied into the project."
        >
          <Input
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </FormField>
        <FormField
          label="Metadata file"
          hint="Optional absolute path. Clinical columns, patient and lesion references where the publisher supplies them."
        >
          <Input
            value={metadataFile}
            onChange={(event) => setMetadataFile(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </FormField>
        <FormField
          label="Annotation file"
          hint="Optional absolute path. Pre-existing geometry, if the source has any."
        >
          <Input
            value={annotationFile}
            onChange={(event) => setAnnotationFile(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
          />
        </FormField>
        <FormField label="Description" hint="Optional. What this data is, and where it came from.">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </FormField>
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The screen
 * ──────────────────────────────────────────────────────────────────────────────────────── */

export function UploadView(): ReactElement {
  const [registered, setRegistered] = useState<Upload | null>(null);
  const id = registered === null ? null : registered.id;

  /**
   * The record is re-read by id rather than trusted from the `POST` response forever: inspection runs
   * on the server *after* registration returns, so the copy in hand goes stale by itself.
   *
   * `-1` is unreachable — `ready` is false whenever `id` is `null` — and it is written as an
   * impossible id rather than `0` so that a refactor which broke the gate would fail loudly at the
   * API instead of quietly fetching registration zero.
   */
  const query = useApiQuery((signal) => getUpload(id ?? -1, signal), {
    ready: !IS_DEMO && id !== null,
    deps: [id],
  });

  const upload: Upload | null = IS_DEMO ? DEMO_UPLOADS.upload : (query.data ?? registered);

  const record =
    query.loading && upload === null ? (
      <Skeleton className="h-64 rounded-lg" label="Loading the registration" />
    ) : query.error !== null && upload === null ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : upload === null ? (
      <EmptyState
        title="Nothing registered in this session"
        description="Register a directory above and its record appears here. There is no list of past registrations — the API exposes one by id — so a directory registered in an earlier session is found through its dataset instead."
        action={<LinkButton href={ROUTES.data.datasets}>View datasets</LinkButton>}
      />
    ) : (
      <div className="space-y-6">
        <Panel
          title="Registration"
          description="What the server recorded. Paths are shown in full, because a shortened path is not a provenance answer."
          actions={
            IS_DEMO ? undefined : (
              <Button size="sm" onClick={() => void query.refetch()} busy={query.refetching}>
                Refresh
              </Button>
            )
          }
          footer={
            upload.dataset_id === null ? undefined : (
              <LinkButton size="sm" href={ROUTES.data.dataset(upload.dataset_id)}>
                Open the dataset
              </LinkButton>
            )
          }
        >
          <DefinitionList items={uploadItems(upload)} />
        </Panel>
        <InspectionPanel upload={upload} />
      </div>
    );

  return (
    <div className="space-y-6">
      {IS_DEMO ? (
        <Alert tone="info" title="Fixture registration — the form is not rendered">
          The record below comes from a fixed fixture. No directory was scanned, the path in it does not
          exist, and the form that would issue a registration is absent rather than inert — a control
          that cannot do its job is worse than no control.
        </Alert>
      ) : (
        <RegisterForm onRegistered={setRegistered} />
      )}
      {record}
    </div>
  );
}
