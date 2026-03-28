import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm",
          success: "bg-green-900/90 border-green-700 text-green-100",
          error: "bg-red-900/90 border-red-700 text-red-100",
          info: "bg-blue-900/90 border-blue-700 text-blue-100",
          warning: "bg-amber-900/90 border-amber-700 text-amber-100",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
