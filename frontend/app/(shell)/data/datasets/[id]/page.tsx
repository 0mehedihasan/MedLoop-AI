/**
 * MedLoop AI — `/data/datasets/[id]`.
 *
 * Server component, and deliberately almost empty. Two things happen here that cannot happen in the
 * client view: the dynamic segment is parsed, and a segment that is not a positive integer is turned
 * into a 404 rather than an id of `NaN` that the API layer would faithfully put in a URL.
 *
 * The `<PageHeader />` is *not* rendered here. The breadcrumb trail must end at the dataset's name,
 * which arrives with the payload — a header rendered at this level could only guess at it.
 */

import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import { DatasetDetailView } from '@/features/datasets/DatasetDetailView';

interface DatasetPageProps {
  /** A promise since Next 15: dynamic params are awaited, not read synchronously. */
  readonly params: Promise<{ readonly id: string }>;
}

export default async function DatasetPage({ params }: DatasetPageProps): Promise<ReactElement> {
  const { id } = await params;

  // `Number('7abc')` is `NaN` and `Number('')` is `0`, so both the parse and the range are checked.
  // Ids are database identities: positive integers, nothing else.
  const datasetId = Number(id);
  if (!Number.isInteger(datasetId) || datasetId <= 0) notFound();

  return <DatasetDetailView datasetId={datasetId} />;
}
