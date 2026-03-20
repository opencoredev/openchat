import * as React from "react"
import { useMountEffect } from "@/hooks/use-mount-effect"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  useMountEffect(() => {
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
        : null

    if (mql) {
      mql.addEventListener("change", onChange)
    } else {
      window.addEventListener("resize", onChange)
    }

    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    return () => {
      if (mql) {
        mql.removeEventListener("change", onChange)
      } else {
        window.removeEventListener("resize", onChange)
      }
    }
  })

  return !!isMobile
}
