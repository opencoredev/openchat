import { Link, createFileRoute } from '@tanstack/react-router'
import { ImageStudio } from '@/components/studio/image-studio'
import { useAuth } from '@/lib/auth-client'
import { convexClient } from '@/lib/convex'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/studio')({
  head: () => ({
    meta: [
      { title: 'Image Studio - osschat' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: StudioPage,
})

function StudioPage() {
  const { isAuthenticated, loading } = useAuth()

  if (!convexClient || loading) {
    return <div className="flex h-full bg-background" />
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-bold">Sign in to open the studio</h1>
        <p className="text-muted-foreground">
          You need to be signed in to build image batches.
        </p>
        <Link to="/auth/sign-in">
          <Button>Sign In</Button>
        </Link>
      </div>
    )
  }

  return <ImageStudio />
}
