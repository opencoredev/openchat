import { type ReactNode, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  CheckCircle2Icon,
  Clock3Icon,
  ImagePlusIcon,
  Layers3Icon,
  PaletteIcon,
  PlusIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type StudioModel = {
  id: string
  name: string
  blurb: string
  speed: string
  price: string
  tint: string
}

type StudioReference = {
  id: string
  label: string
  note: string
  initials: string
  tint: string
}

type AspectOption = {
  id: string
  label: string
  ratio: string
  frameClassName: string
}

type StudioResult = {
  id: string
  modelId: string
  prompt: string
  status: 'ready' | 'rendering'
  latency: string
  price: string
  aspectId: string
  artIndex: number
}

const STUDIO_MODELS: Array<StudioModel> = [
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    blurb: 'Fast concept frames with punchy composition.',
    speed: '8s avg',
    price: '$0.039',
    tint: 'from-amber-500/20 via-rose-500/10 to-transparent',
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    blurb: 'Sharper surfaces and stronger photoreal cleanup.',
    speed: '19s avg',
    price: '$0.150',
    tint: 'from-fuchsia-500/20 via-orange-500/10 to-transparent',
  },
  {
    id: 'seedream-v4.5',
    name: 'Seedream v4.5',
    blurb: 'Editorial realism with confident lighting control.',
    speed: '22s avg',
    price: '$0.180',
    tint: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  {
    id: 'flux-2-flex',
    name: 'Flux 2 Flex',
    blurb: 'Stylized variation engine for remix-heavy batches.',
    speed: '14s avg',
    price: '$0.120',
    tint: 'from-sky-500/20 via-violet-500/10 to-transparent',
  },
]

const REFERENCES: Array<StudioReference> = [
  {
    id: 'founder',
    label: 'Founder',
    note: 'Face reference',
    initials: 'FD',
    tint: 'from-amber-300 via-rose-300 to-orange-500',
  },
  {
    id: 'product-shot',
    label: 'Product',
    note: 'Material language',
    initials: 'PR',
    tint: 'from-emerald-300 via-teal-300 to-cyan-500',
  },
  {
    id: 'campaign',
    label: 'Campaign',
    note: 'Mood + wardrobe',
    initials: 'CM',
    tint: 'from-violet-300 via-fuchsia-300 to-pink-500',
  },
]

const ASPECT_OPTIONS: Array<AspectOption> = [
  { id: '1:1', label: 'Square', ratio: '1:1', frameClassName: 'aspect-square' },
  {
    id: '4:5',
    label: 'Portrait',
    ratio: '4:5',
    frameClassName: 'aspect-[4/5]',
  },
  {
    id: '16:9',
    label: 'Landscape',
    ratio: '16:9',
    frameClassName: 'aspect-video',
  },
  {
    id: '9:16',
    label: 'Story',
    ratio: '9:16',
    frameClassName: 'aspect-[9/16]',
  },
]

const STYLE_RECIPES = [
  'Editorial portrait',
  'Soft tungsten',
  'Luxury product',
  'Neo-noir street',
  'Grainy film still',
  'Monochrome study',
]

const ART_BACKGROUNDS = [
  'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.72), transparent 16%), radial-gradient(circle at 78% 22%, rgba(255,207,124,0.45), transparent 20%), linear-gradient(145deg, rgba(86,48,34,0.95) 0%, rgba(176,87,54,0.92) 38%, rgba(58,32,29,0.96) 100%)',
  'radial-gradient(circle at 60% 16%, rgba(255,244,214,0.74), transparent 17%), radial-gradient(circle at 28% 74%, rgba(214,255,229,0.34), transparent 26%), linear-gradient(155deg, rgba(19,64,54,0.96) 0%, rgba(33,128,104,0.94) 46%, rgba(10,28,29,0.98) 100%)',
  'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.65), transparent 15%), radial-gradient(circle at 73% 66%, rgba(255,157,130,0.42), transparent 24%), linear-gradient(150deg, rgba(47,34,75,0.96) 0%, rgba(118,84,144,0.92) 42%, rgba(27,20,37,0.98) 100%)',
  'radial-gradient(circle at 80% 18%, rgba(255,244,201,0.7), transparent 15%), radial-gradient(circle at 26% 75%, rgba(145,214,255,0.35), transparent 24%), linear-gradient(150deg, rgba(33,48,84,0.95) 0%, rgba(70,104,154,0.93) 45%, rgba(17,23,35,0.98) 100%)',
  'radial-gradient(circle at 22% 20%, rgba(255,255,255,0.6), transparent 16%), radial-gradient(circle at 72% 35%, rgba(255,199,147,0.4), transparent 22%), linear-gradient(150deg, rgba(88,56,31,0.96) 0%, rgba(164,116,59,0.91) 50%, rgba(34,23,18,0.98) 100%)',
  'radial-gradient(circle at 70% 18%, rgba(255,255,255,0.65), transparent 17%), radial-gradient(circle at 22% 72%, rgba(255,152,204,0.35), transparent 26%), linear-gradient(155deg, rgba(74,34,50,0.96) 0%, rgba(153,71,108,0.92) 44%, rgba(31,20,28,0.98) 100%)',
]

const INITIAL_RESULTS: Array<StudioResult> = [
  {
    id: 'seedream-launch',
    modelId: 'seedream-v4.5',
    prompt:
      'Luxury campaign portrait with brushed aluminum props and studio haze',
    status: 'ready',
    latency: '21.8s',
    price: '$0.180',
    aspectId: '4:5',
    artIndex: 1,
  },
  {
    id: 'banana-cafe',
    modelId: 'nano-banana',
    prompt:
      'Golden hour cafe frame with polished chrome details and bold shadows',
    status: 'ready',
    latency: '8.4s',
    price: '$0.039',
    aspectId: '4:5',
    artIndex: 0,
  },
  {
    id: 'flux-runway',
    modelId: 'flux-2-flex',
    prompt:
      'Streetwear lookbook scene with wet pavement reflections and flash photography',
    status: 'ready',
    latency: '14.7s',
    price: '$0.120',
    aspectId: '9:16',
    artIndex: 2,
  },
  {
    id: 'banana-pro-still',
    modelId: 'nano-banana-pro',
    prompt: 'Product still life with a mirrored plinth and dramatic side light',
    status: 'ready',
    latency: '18.9s',
    price: '$0.150',
    aspectId: '1:1',
    artIndex: 4,
  },
  {
    id: 'seedream-lobby',
    modelId: 'seedream-v4.5',
    prompt:
      'Boutique hotel lobby concept with sculptural furniture and diffuse daylight',
    status: 'ready',
    latency: '22.4s',
    price: '$0.180',
    aspectId: '16:9',
    artIndex: 5,
  },
]

const DEFAULT_PROMPT =
  'Make him look more like an iconic product founder, shot like a premium launch campaign, with soft tungsten highlights and confident eye contact.'

export function ImageStudio() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [selectedModels, setSelectedModels] = useState<Array<string>>([
    'nano-banana',
    'seedream-v4.5',
    'flux-2-flex',
  ])
  const [selectedAspect, setSelectedAspect] = useState('4:5')
  const [selectedRecipe, setSelectedRecipe] = useState(STYLE_RECIPES[0])
  const [results, setResults] = useState<Array<StudioResult>>(INITIAL_RESULTS)
  const timeoutsRef = useRef<Array<number>>([])

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  const activeModels = STUDIO_MODELS.filter((model) =>
    selectedModels.includes(model.id),
  )
  const renderingCount = results.filter(
    (result) => result.status === 'rendering',
  ).length
  const selectedAspectOption =
    ASPECT_OPTIONS.find((option) => option.id === selectedAspect) ??
    ASPECT_OPTIONS[0]

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) => {
      if (current.includes(modelId)) {
        if (current.length === 1) return current
        return current.filter((id) => id !== modelId)
      }

      return [...current, modelId]
    })
  }

  const queueBatch = () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) return

    const nextBatch = activeModels.map((model, index) => ({
      id: `${model.id}-${Date.now()}-${index}`,
      modelId: model.id,
      prompt: trimmedPrompt,
      status: 'rendering' as const,
      latency: `${8 + index * 4}.${index + 2}s`,
      price: model.price,
      aspectId: selectedAspect,
      artIndex: (results.length + index + 1) % ART_BACKGROUNDS.length,
    }))

    setResults((current) => [...nextBatch, ...current].slice(0, 14))

    nextBatch.forEach((result, index) => {
      const timeoutId = window.setTimeout(
        () => {
          setResults((current) =>
            current.map((item) =>
              item.id === result.id
                ? {
                    ...item,
                    status: 'ready',
                    latency: `${9 + index * 5}.${index + 4}s`,
                  }
                : item,
            ),
          )
        },
        1100 + index * 500,
      )

      timeoutsRef.current.push(timeoutId)
    })
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_28%),radial-gradient(circle_at_bottom_right,color-mix(in_oklch,var(--foreground)_10%,transparent),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[28rem] bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_52%)]" />

      <div className="relative flex min-h-0 w-full flex-col xl:flex-row">
        <aside className="w-full shrink-0 border-b border-border/60 bg-sidebar/70 backdrop-blur-xl xl:w-[24rem] xl:border-b-0 xl:border-r">
          <div className="scrollbar-thin flex h-full flex-col overflow-y-auto px-4 py-5 md:px-5 xl:px-6">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="border-primary/20 bg-primary/10 text-primary"
              >
                <SparklesIcon className="size-3.5" />
                Image Studio
              </Badge>
              <div className="space-y-1">
                <h1 className="text-[clamp(1.8rem,3vw,2.5rem)] font-semibold leading-tight tracking-tight">
                  Build cinematic image batches inside osschat.
                </h1>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Queue multiple models, keep references close, and compare
                  polished outputs in one moody art-direction workspace.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <StudioPanel
                eyebrow="Prompt"
                title="Describe the frame"
                action={
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/40"
                  >
                    {activeModels.length} active
                  </Badge>
                }
              >
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe your image..."
                  className="min-h-36 rounded-[1.6rem] border-border/60 bg-background/65 px-4 py-4 text-[15px] leading-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {STYLE_RECIPES.map((recipe) => (
                    <button
                      key={recipe}
                      type="button"
                      onClick={() => setSelectedRecipe(recipe)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        recipe === selectedRecipe
                          ? 'border-primary/35 bg-primary/12 text-primary'
                          : 'border-border/70 bg-background/40 text-muted-foreground hover:border-primary/20 hover:text-foreground',
                      )}
                    >
                      {recipe}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <WandSparklesIcon className="size-3.5" />
                    Recipe: {selectedRecipe}
                  </div>
                  <Button
                    onClick={queueBatch}
                    className="h-11 rounded-[1.2rem] px-5 shadow-[0_18px_40px_color-mix(in_oklch,var(--primary)_22%,transparent)]"
                  >
                    <SparklesIcon className="size-4" />
                    {renderingCount > 0
                      ? `Generating ${renderingCount}...`
                      : 'Generate batch'}
                  </Button>
                </div>
              </StudioPanel>

              <StudioPanel
                eyebrow="References"
                title="Anchor the look"
                action={
                  <button className="text-xs text-muted-foreground">
                    Clear
                  </button>
                }
              >
                <div className="grid grid-cols-4 gap-3">
                  {REFERENCES.map((reference) => (
                    <div key={reference.id} className="space-y-2">
                      <div
                        className={cn(
                          'flex aspect-square items-end rounded-[1.4rem] border border-border/60 bg-gradient-to-br p-2 text-white shadow-[0_18px_40px_rgba(0,0,0,0.15)]',
                          reference.tint,
                        )}
                      >
                        <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] font-semibold backdrop-blur-sm">
                          {reference.initials}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {reference.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {reference.note}
                        </p>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex aspect-square flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-border/70 bg-background/40 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <ImagePlusIcon className="mb-2 size-5" />
                    <span className="text-xs">Add</span>
                  </button>
                </div>
              </StudioPanel>

              <StudioPanel
                eyebrow="Models"
                title="Run the prompt across different engines"
                action={
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/40"
                  >
                    {activeModels.length} selected
                  </Badge>
                }
              >
                <div className="space-y-3">
                  {STUDIO_MODELS.map((model) => {
                    const selected = selectedModels.includes(model.id)

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => toggleModel(model.id)}
                        className={cn(
                          'w-full rounded-[1.5rem] border px-4 py-3 text-left transition-all',
                          'bg-[linear-gradient(135deg,color-mix(in_oklch,var(--card)_92%,transparent),color-mix(in_oklch,var(--background)_88%,transparent))]',
                          selected
                            ? 'border-primary/35 shadow-[0_22px_50px_color-mix(in_oklch,var(--primary)_10%,transparent)]'
                            : 'border-border/65 hover:border-primary/20',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">
                              {model.name}
                            </p>
                            <p className="mt-1 text-sm leading-5 text-muted-foreground">
                              {model.blurb}
                            </p>
                          </div>
                          <div
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                              selected
                                ? 'border-primary/35 bg-primary/15 text-primary'
                                : 'border-border/70 text-transparent',
                            )}
                          >
                            <CheckCircle2Icon className="size-4" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              'h-2.5 w-12 rounded-full bg-gradient-to-r',
                              model.tint,
                            )}
                          />
                          <span>{model.speed}</span>
                          <span className="text-border">/</span>
                          <span>{model.price}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </StudioPanel>

              <StudioPanel eyebrow="Frame" title="Aspect ratio and pacing">
                <div className="grid grid-cols-2 gap-3">
                  {ASPECT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedAspect(option.id)}
                      className={cn(
                        'rounded-[1.3rem] border px-3 py-3 text-left transition-colors',
                        option.id === selectedAspect
                          ? 'border-primary/35 bg-primary/10'
                          : 'border-border/70 bg-background/40 hover:border-primary/20',
                      )}
                    >
                      <div
                        className={cn(
                          'mx-auto mb-3 rounded-md border border-border/50 bg-card/70',
                          option.frameClassName,
                          option.id === '16:9' ? 'w-14' : '',
                          option.id === '4:5' ? 'w-10' : '',
                          option.id === '1:1' ? 'w-12' : '',
                          option.id === '9:16' ? 'w-8' : '',
                        )}
                      />
                      <p className="text-sm font-medium text-foreground">
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {option.ratio}
                      </p>
                    </button>
                  ))}
                </div>
              </StudioPanel>
            </div>
          </div>
        </aside>

        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-5 md:px-6 xl:px-8">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden rounded-[2rem] border border-border/60 bg-[linear-gradient(145deg,color-mix(in_oklch,var(--card)_92%,transparent),color-mix(in_oklch,var(--background)_86%,transparent))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.12)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl space-y-3">
                    <Badge
                      variant="outline"
                      className="border-primary/20 bg-primary/10 text-primary"
                    >
                      <Layers3Icon className="size-3.5" />
                      Batch workspace
                    </Badge>
                    <div className="space-y-2">
                      <h2 className="text-[clamp(1.8rem,4vw,3.3rem)] font-semibold leading-[1.05] tracking-tight">
                        Compare multiple renders without losing the art
                        direction thread.
                      </h2>
                      <p className="max-w-xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                        This studio keeps prompts, references, and model
                        experiments visible at the same time, so refining a
                        campaign image feels like creative work, not config
                        hunting.
                      </p>
                    </div>
                  </div>

                  <div className="grid min-w-[15rem] gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <HeroMetric
                      label="Active models"
                      value={String(activeModels.length)}
                      hint="Multi-engine batch"
                    />
                    <HeroMetric
                      label="Current frame"
                      value={selectedAspectOption.ratio}
                      hint={selectedAspectOption.label}
                    />
                    <HeroMetric
                      label="Queue status"
                      value={renderingCount > 0 ? 'Live' : 'Idle'}
                      hint={
                        renderingCount > 0
                          ? `${renderingCount} rendering`
                          : 'Ready to generate'
                      }
                    />
                  </div>
                </div>

                <Separator className="my-5 bg-border/60" />

                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/50"
                  >
                    <PaletteIcon className="size-3.5" />
                    {selectedRecipe}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/50"
                  >
                    <Clock3Icon className="size-3.5" />
                    {activeModels.map((model) => model.speed).join(' / ')}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border/70 bg-background/50"
                  >
                    <SparklesIcon className="size-3.5" />
                    Prompt tuned for premium launch visuals
                  </Badge>
                </div>
              </motion.section>

              <motion.aside
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="rounded-[2rem] border border-border/60 bg-card/75 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.1)]"
              >
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Batch notes
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">
                      Studio state stays visible while you iterate.
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <RightRailRow
                      label="Prompt DNA"
                      value="Founder energy, premium launch, tungsten glow"
                    />
                    <RightRailRow
                      label="Reference lock"
                      value="Face, product material, campaign mood"
                    />
                    <RightRailRow
                      label="Render spread"
                      value={`${activeModels.length} engines across ${selectedAspectOption.ratio}`}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 w-full justify-between rounded-[1.2rem] border-border/70 bg-background/50 px-4"
                  >
                    Add seed variation
                    <PlusIcon className="size-4" />
                  </Button>
                </div>
              </motion.aside>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                  Gallery
                </p>
                <h3 className="mt-1 text-xl font-semibold">
                  Recent renders and live generations
                </h3>
              </div>
              <Badge
                variant="outline"
                className="border-border/70 bg-background/50"
              >
                {results.filter((result) => result.status === 'ready').length}{' '}
                ready
              </Badge>
            </div>

            <div className="columns-1 gap-4 md:columns-2 2xl:columns-3 [column-fill:_balance]">
              {results.map((result, index) => (
                <motion.article
                  key={result.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.38,
                    delay: Math.min(index * 0.04, 0.2),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="mb-4 break-inside-avoid overflow-hidden rounded-[1.8rem] border border-border/60 bg-card/75 p-3 shadow-[0_22px_54px_rgba(0,0,0,0.08)]"
                >
                  <ResultCard result={result} />
                </motion.article>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function StudioPanel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-[1.8rem] border border-border/60 bg-[linear-gradient(145deg,color-mix(in_oklch,var(--card)_94%,transparent),color-mix(in_oklch,var(--background)_88%,transparent))] p-4 shadow-[0_22px_60px_rgba(0,0,0,0.06)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function HeroMetric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/60 bg-background/45 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function RightRailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.3rem] border border-border/60 bg-background/40 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
    </div>
  )
}

function ResultCard({ result }: { result: StudioResult }) {
  const model =
    STUDIO_MODELS.find((item) => item.id === result.modelId) ?? STUDIO_MODELS[0]
  const aspectOption =
    ASPECT_OPTIONS.find((option) => option.id === result.aspectId) ??
    ASPECT_OPTIONS[0]

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative overflow-hidden rounded-[1.45rem] border border-white/8',
          aspectOption.frameClassName,
        )}
        style={{ backgroundImage: ART_BACKGROUNDS[result.artIndex] }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(10,10,10,0.02),rgba(10,10,10,0.4))]" />
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <Badge
            className="border-0 bg-black/30 text-white backdrop-blur-sm"
            variant="secondary"
          >
            {model.name}
          </Badge>
          <Badge
            className={cn(
              'border-0 backdrop-blur-sm',
              result.status === 'rendering'
                ? 'bg-black/25 text-white'
                : 'bg-white/14 text-white',
            )}
            variant="secondary"
          >
            {result.status === 'rendering' ? 'Rendering' : 'Ready'}
          </Badge>
        </div>
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <div className="max-w-[80%] rounded-2xl bg-black/28 px-3 py-2 backdrop-blur-sm">
            <p className="line-clamp-2 text-sm leading-5 text-white/92">
              {result.prompt}
            </p>
          </div>
          <div className="rounded-full bg-black/28 px-3 py-1.5 text-[11px] font-medium text-white/85 backdrop-blur-sm">
            {aspectOption.ratio}
          </div>
        </div>
      </div>

      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between gap-3">
          <p className="line-clamp-1 font-medium text-foreground">
            {model.name}
          </p>
          <p className="text-sm text-muted-foreground">{result.price}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3Icon className="size-3.5" />
          <span>{result.latency}</span>
          <span className="text-border">/</span>
          <span>
            {result.status === 'rendering'
              ? 'Queued in live batch'
              : 'Finished and pinned'}
          </span>
        </div>
      </div>
    </div>
  )
}
