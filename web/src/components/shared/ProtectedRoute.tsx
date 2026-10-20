import AppLoader from "@/components/shared/AppLoader"
import { useGetMe } from "@/hooks/useUserQuery"
import { useAuth, useClerk } from "@clerk/clerk-react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe()
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const navigate = useNavigate()

  // Right after sign-in the live Clerk client already has an active session,
  // but the React auth state (isSignedIn) can lag a render or two behind.
  // Treat that window as still loading - redirecting on it is what bounced
  // freshly signed-in users back to "/".
  const isSessionSettling =
    isLoaded && !isSignedIn && clerk.session?.status === "active"

  useEffect(() => {
    if (!isLoading && !isSessionSettling && !user) {
      navigate("/", { replace: true })
    }
  }, [user, isLoading, isSessionSettling, navigate])

  if (isLoading || isSessionSettling) {
    return <AppLoader message="Authenticating..." />
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
