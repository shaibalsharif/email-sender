"use client"


import { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ShieldCheck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type Resolver = (ok: boolean) => void

interface VerificationOptions {
    actionLabel?: string
}

export function useSecretVerification() {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [code, setCode] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [actionLabel, setActionLabel] = useState<string>("Protected action")
    const resolverRef = useRef<Resolver | null>(null)

    const requireVerification = (options?: VerificationOptions): Promise<boolean> => {
        // Cancel any previous pending promise
        if (resolverRef.current) {
            resolverRef.current(false)
        }


        setActionLabel(options?.actionLabel || "Protected action")
        setCode("")
        setError(null)
        setOpen(true)


        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve
        })
    }


    const resolveAndReset = (value: boolean) => {
        if (resolverRef.current) {
            resolverRef.current(value)
            resolverRef.current = null
        }
        setOpen(false)
        setLoading(false)
        setCode("")
        setError(null)
    }


    const handleCancel = () => {
        resolveAndReset(false)
    }


    const handleConfirm = async () => {
        if (!code.trim()) {
            setError("Please enter the secret code.")
            return
        }


        setLoading(true)
        setError(null)


        try {
            const response = await fetch("/api/verify-secret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.trim() }),
            })


            const data = await response.json().catch(() => ({}))


            if (!response.ok || !data.ok) {
                setError("Invalid code. Please try again.")
                setLoading(false)
                return
            }


            toast({
                title: "Verified",
                description: `You are authorized to ${actionLabel.toLowerCase()}.`,
            })


            resolveAndReset(true)
        } catch (error) {
            console.error("Verification error", error)
            setError("Verification failed. Check your network and try again.")
            setLoading(false)
        }
    }
    const VerificationDialog = (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-blue-600" />
                        Protected Action
                    </DialogTitle>
                    <DialogDescription>
                        Enter your SEND secret code to continue:
                        <span className="block mt-1 font-medium text-foreground">
                            {actionLabel}
                        </span>
                    </DialogDescription>
                </DialogHeader>


                <div className="space-y-3">
                    {error && (
                        <Alert variant="destructive" className="text-sm">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}


                    <div className="space-y-1">
                        <label className="text-sm font-medium">Secret code</label>
                        <Input
                            type="password"
                            autoFocus
                            value={code}
                            disabled={loading}
                            onChange={(e) => setCode(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault()
                                    void handleConfirm()
                                }
                            }}
                            placeholder="Enter SEND secret"
                        />
                    </div>
                </div>


                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={handleCancel} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={loading}>
                        {loading ? "Verifying..." : "Verify & Continue"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )


    return { requireVerification, VerificationDialog }
}