'use client';

/**
 * MedLoop AI — the §10 layout preview for `/analyze` and `/analyze/compare`.
 *
 * ## Why this file exists at all
 *
 * §10 forbids rendering any number as a trained model's performance, and §15 records that **no model
 * has been trained on this machine**. Both analyse screens therefore show `Blocked` in demo mode. But a
 * research view that has never been on screen cannot be designed: the tiles, the per-class table, the
 * confusion matrix and the version-to-version deltas all need to be laid out before there is anything
 * real to put in them. §10 grants exactly one carve-out for that — "a separate, explicitly-labelled
 * *layout preview* toggle exists so the research view can be designed, and its numbers are watermarked
 * SYNTHETIC" — and this file is it.
 *
 * ## Four properties keep a preview figure from being mistaken for a result
 *
 * 1. **Unreachable by default.** The disclosure is closed on mount and nothing renders until someone
 *    clicks. No figure appears as a side effect of navigation.
 * 2. **The watermark is inside the same subtree as the numbers.** `<SyntheticWatermark />` wraps the
 *    content, not the page, so a screenshot or a PDF carries the word SYNTHETIC across the figures
 *    themselves. A banner above the panel would be cropped out by any screenshot of the panel.
 * 3. **It says so in text as well as in pixels.** The disclosure's own copy states that nothing here
 *    was measured, and `SyntheticWatermark` adds a `VisuallyHidden` announcement for screen readers,
 *    who cannot see a diagonal watermark at 13 % opacity.
 * 4. **The controls are inert.** `ModelRegistry` is given `actionable={false}`, so Promote and Reject
 *    are *absent* rather than disabled (§2.3) — a promotion is a real audited transition and there is
 *    no version to transition.
 *
 * ## Sole consumer of `DEMO_ANALYZE.preview`
 *
 * `demo-analyze.ts` puts the synthetic half behind a `previewOnly: true` marker so nothing can reach a
 * hand-typed metric by accident. This module is the only place that destructures it. The live views read
 * `DEMO_ANALYZE.models`, which is `[]`.
 *
 * ## The same bodies as the live screens
 *
 * `EvaluationBody`, `ComparisonBody` and `ModelRegistry` are imported, not reimplemented. A second copy
 * of "how an evaluation is laid out" would drift from the real one, and then the preview would be
 * designing a screen that does not exist.
 */

import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Card';
import { RadioGroup } from '@/components/ui/Choice';
import { SyntheticWatermark } from '@/components/ui/project';
import { EmptyState } from '@/components/ui/states';
import { DEMO_ANALYZE } from '@/lib/demo/demo-analyze';
import { PromotionMetric } from '@/types/domain';

import { ComparisonBody } from './CompareView';
import { EvaluationBody } from './EvaluationDetail';
import { ModelRegistry } from './ModelRegistry';

/**
 * The preview's promotion metric.
 *
 * Hard-coded to the §8.1 default rather than read from `GET /admin/settings/training`. The preview is
 * about layout, and a settings read that failed would silently change which tile is marked — a
 * difference a reader would attribute to the fixture. It is also the one value in this file that is not
 * synthetic: `MACRO_F1` genuinely is the configured default.
 */
const PREVIEW_PRIMARY_METRIC = PromotionMetric.MACRO_F1;

/* ────────────────────────────────────────────────────────────────────────────────────────
 * The disclosure shell
 * ──────────────────────────────────────────────────────────────────────────────────────── */

interface PreviewDisclosureProps {
  readonly title: string;
  /** What the preview is for, in the caller's words. Shown whether it is open or closed. */
  readonly description: string;
  readonly children: ReactNode;
}

/**
 * A closed-by-default disclosure whose contents are watermarked.
 *
 * Not a `<details>` element: the summary would be the only thing announcing what is inside, and this
 * needs a permanent warning that survives the closed state. So the explanation is always rendered and
 * only the figures are behind the button.
 *
 * `aria-expanded` and `aria-controls` are on the button because the region below it is not a sibling
 * `<summary>`/content pair the browser already understands.
 */
function PreviewDisclosure({
  title,
  description,
  children,
}: PreviewDisclosureProps): ReactElement {
  const [open, setOpen] = useState(false);
  const regionId = 'analyze-layout-preview';

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={regionId}
        >
          {open ? 'Hide the layout preview' : 'Show the layout preview'}
        </Button>
      }
    >
      <div id={regionId}>
        {open ? (
          <SyntheticWatermark>{children}</SyntheticWatermark>
        ) : (
          <p className="max-w-prose text-sm text-content-secondary">
            Closed. Nothing in the preview was measured — the figures are hand-typed to be
            <em> shaped</em> like an evaluation so the layout can be judged, and every one of them is
            watermarked SYNTHETIC while it is on screen.
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * /analyze
 * ──────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The registry and one evaluation, as `/analyze` will lay them out.
 *
 * `v3` is selected first: it is the `CANDIDATE`, and a candidate's evaluation is the one this screen
 * exists to read. Selection is live so the registry's own row-header button can be exercised — it is
 * the only interaction in the preview that does anything, because it changes nothing outside the
 * component.
 */
export function AnalyzeLayoutPreview(): ReactElement {
  const { models, evaluations } = DEMO_ANALYZE.preview;
  const [selectedId, setSelectedId] = useState<number | null>(models[0]?.id ?? null);
  const evaluation = selectedId === null ? undefined : evaluations[selectedId];

  return (
    <PreviewDisclosure
      title="Layout preview — synthetic"
      description="What this screen will look like once a training run has registered a version and evaluated it. The numbers below were typed by hand, not measured: no model has been trained on this machine, and no figure here came from a forward pass."
    >
      <div className="space-y-6">
        <ModelRegistry
          models={models}
          selectedId={selectedId}
          onSelect={setSelectedId}
          primary={PREVIEW_PRIMARY_METRIC}
          actionable={false}
        />
        {evaluation === undefined ? (
          <EmptyState
            title="No evaluation for the selected version"
            description="The fixture carries an evaluation for each preview version, so reaching this state means a version id and an evaluation key have drifted apart."
          />
        ) : (
          <EvaluationBody evaluation={evaluation} primary={PREVIEW_PRIMARY_METRIC} />
        )}
      </div>
    </PreviewDisclosure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────
 * /analyze/compare
 * ──────────────────────────────────────────────────────────────────────────────────────── */

type PreviewCase = 'comparable' | 'incomparable';

/**
 * Both branches of `GET /models/comparison`, chosen with a radio group.
 *
 * The refusal is not an error state to be shown once and forgotten — §9 makes it a normal outcome, and
 * it is the branch most likely to rot, because it is the one nobody sees while a project has a single
 * locked test version. Putting it behind an explicit control means the layout of the refusal gets
 * designed too, and the branch is not dead code in the preview.
 *
 * `comparable` is the default because the default should show the layout that will normally be on
 * screen.
 */
export function CompareLayoutPreview(): ReactElement {
  const { comparison, incomparable } = DEMO_ANALYZE.preview;
  const [shown, setShown] = useState<PreviewCase>('comparable');

  return (
    <PreviewDisclosure
      title="Layout preview — synthetic"
      description="What a comparison will look like across three versions on one locked test set, and what the server's refusal looks like when the versions were measured on different test data. Nothing below was measured."
    >
      <div className="space-y-6">
        <RadioGroup<PreviewCase>
          legend="Which outcome to preview"
          name="compare-preview-case"
          value={shown}
          onValueChange={setShown}
          orientation="horizontal"
          options={[
            {
              value: 'comparable',
              label: 'Comparable',
              description: 'Three versions, all evaluated on the same locked test dataset version.',
            },
            {
              value: 'incomparable',
              label: 'Refused',
              description:
                'Different locked test versions, so the server answers comparable: false with a reason and no rows.',
            },
          ]}
          hint="Both are real shapes of the same response. The refusal is the one that renders the server's sentence instead of the figures (§9)."
        />
        <ComparisonBody
          comparison={shown === 'comparable' ? comparison : incomparable}
          primary={PREVIEW_PRIMARY_METRIC}
        />
      </div>
    </PreviewDisclosure>
  );
}
