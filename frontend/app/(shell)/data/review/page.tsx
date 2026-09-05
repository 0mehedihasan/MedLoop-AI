/**
 * MedLoop AI — `/data/review`, the review queue screen.
 *
 * Thin on purpose. Everything with a consequence — history, layer flags, selection, the timer, the
 * confirmations, submit and skip — lives in `ReviewWorkspace`. A page that held some of that state
 * would give one screen two authorities over the same decision.
 *
 * No `'use client'`: this file reads nothing and handles nothing, so it stays a server component and
 * the interactive boundary starts exactly where the interaction does. `PageHeader` derives its
 * breadcrumbs from `lib/navigation`, which is also where the guard for this path lives — Review Data
 * is a child of Data & Admin and never a top-level entry (§11.1).
 */

import type { ReactElement } from 'react';

import { PageHeader } from '@/components/shell/PageHeader';
import { ReviewWorkspace } from '@/features/review/ReviewWorkspace';

export default function ReviewPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Review Data"
        description="One image at a time: read what the model said, draw the region you would accept, choose the label, submit. A validated sample joins the HITL pool; a skipped one never does."
      />
      <ReviewWorkspace />
    </>
  );
}
