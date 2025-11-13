"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { 
  AlertCircle, 
  Send, 
  User, 
  Loader2, 
  Mail, 
  ChevronsRight,
  CheckCircle2
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"

// Define types for clarity
interface Contact {
  email: string
  name: string
  custom_fields: Record<string, string> // Matching API response format
}

interface SelectedContact extends Contact {
  checked: boolean
  personalizedSubject: string
  personalizedBody: string
}

interface ComposeTabProps {
  config: {
    mailgunDomain: string
    fromEmail: string
    fromName: string
    isFromEnv: boolean
  } | null
  isTestingMode: boolean // NEW: Prop to control testing mode
}

const MAX_TEST_CAMPAIGN_SIZE = 5;
const THROTTLING_DELAY_MS = 6000; // 6000ms ensures max 10 emails per minute (60,000 / 6000 = 10)

const getVariables = (template: string) => {
  const regex = /\{\{(\w+)\}\}/g
  const variables = new Set<string>()
  let match
  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1])
  }
  return Array.from(variables)
}

const replaceVariables = (template: string, values: Record<string, string>) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || `{{${key}}}`)
}

const applyMarkdown = (markdown: string): string => {
  return markdown
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
    .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic
    .replace(/\[(.+?)\]$$(.+?)$$/g, '<a href="$2" style="color: #0066cc;">$1</a>') // Links
    .replace(/^### (.*?)$/gm, "<h3>$1</h3>") // H3
    .replace(/^## (.*?)$/gm, "<h2>$1</h2>") // H2
    .replace(/^# (.*?)$/gm, "<h1>$1</h1>") // H1
    .replace(/\n/g, "<br/>") // Line breaks
}

export default function ComposeTab({ config, isTestingMode }: ComposeTabProps) {
  const [subject, setSubject] = useState("Hello {{name}}!")
  const [body, setBody] = useState(
    "Hi {{name}},\n\nWe have a special offer from {{company}}.\n\nBest regards,\nThe Team",
  )
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContacts, setSelectedContacts] = useState<SelectedContact[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalToSend, setTotalToSend] = useState(0)
  const [previewContact, setPreviewContact] = useState<SelectedContact | null>(null)
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
  const [imageUrl, setImageUrl] = useState("")
  const [showMarkdownGuide, setShowMarkdownGuide] = useState(false)
  const [previewVariables, setPreviewVariables] = useState<{ name: string; company: string }>({
    name: "John Doe",
    company: "Acme Corp",
  })

  // Fetch contacts on mount
  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch("/api/contacts")
        if (response.ok) {
          const data = await response.json()
          setContacts(data)
        } else {
          setContacts([])
          setStatus({ type: "error", message: "Failed to load contacts from database." })
        }
      } catch (error) {
        console.error("Error fetching contacts:", error)
        setStatus({ type: "error", message: "Network error loading contacts." })
      }
    }
    loadContacts()
  }, [])
  
  // Update preview contact when subject/body changes
  useEffect(() => {
    if (selectedContacts.length > 0) {
      setPreviewContact(selectedContacts[0]);
    } else if (contacts.length > 0) {
      // Use the first contact for a generic preview if nothing is selected yet
      const firstContact = contacts[0];
      setPreviewContact({
        ...firstContact,
        checked: true,
        personalizedSubject: replaceVariables(subject, { name: firstContact.name, ...firstContact.custom_fields }),
        personalizedBody: replaceVariables(body, { name: firstContact.name, ...firstContact.custom_fields }),
      });
    } else {
      setPreviewContact(null);
    }
  }, [subject, body, contacts, selectedContacts])


  const allVariables = useMemo(() => {
    return [...new Set([...getVariables(subject), ...getVariables(body)])]
  }, [subject, body])

  const prepareContactsForPreview = () => {
    if (!config || !config.mailgunDomain || !config.fromEmail) {
      setStatus({ type: "error", message: "Missing configuration. Check the Configuration tab." })
      return
    }

    let contactsToUse = contacts;
    if (isTestingMode) {
      // In testing mode, limit to max 5 emails, starting with the first 5.
      contactsToUse = contacts.slice(0, MAX_TEST_CAMPAIGN_SIZE);
    }
    
    if (contactsToUse.length === 0) {
      setStatus({ type: "error", message: "No contacts available to send the campaign." })
      return
    }

    const preparedContacts: SelectedContact[] = contactsToUse.map((c: Contact) => {
      const allFields = { name: c.name, ...c.custom_fields };
      return {
        ...c,
        checked: true, // Default to checked
        personalizedSubject: replaceVariables(subject, allFields),
        personalizedBody: replaceVariables(body, allFields),
      };
    });
    
    setSelectedContacts(preparedContacts);
    setPreviewContact(preparedContacts[0] || null);
    setIsModalOpen(true);
  }

  const handleToggleContact = (email: string, checked: boolean) => {
    setSelectedContacts(prev =>
      prev.map(c => (c.email === email ? { ...c, checked } : c))
    );
  };
  
  const handleSelectAll = (checked: boolean) => {
    setSelectedContacts(prev => prev.map(c => ({ ...c, checked })));
  };

  const handleConfirmSend = async () => {
    const recipients = selectedContacts.filter(c => c.checked);
    if (recipients.length === 0) {
      setStatus({ type: "error", message: "No recipients selected for sending." });
      setIsModalOpen(false);
      return;
    }

    if (!config) {
      setStatus({ type: "error", message: "Configuration missing. Cannot proceed." });
      setIsModalOpen(false);
      return;
    }

    setSending(true);
    setIsModalOpen(false);
    setProgress(0);
    setTotalToSend(recipients.length);
    let sentCount = 0;

    try {
      for (let i = 0; i < recipients.length; i++) {
        const contact = recipients[i];
        
        // Throttling logic for testing mode (max 10/min)
        if (isTestingMode && i > 0) {
            // Wait for 6 seconds (6000ms) before sending the next email.
            // This caps the rate at 10 emails per minute (60s / 6s = 10).
            await new Promise(resolve => setTimeout(resolve, THROTTLING_DELAY_MS));
        }
        
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: contact.email,
            recipientName: contact.name,
            subject: contact.personalizedSubject,
            body: contact.personalizedBody,
            imageUrl: imageUrl,
            mailgunDomain: config.mailgunDomain,
            fromEmail: config.fromEmail,
            fromName: config.fromName,
          }),
        });

        if (response.ok) {
          sentCount++;
        }
        
        setProgress(i + 1);
      }

      setStatus({ 
        type: "success", 
        message: `Campaign complete! Sent ${sentCount} / ${totalToSend} emails.` 
      });

    } catch (error) {
      console.error("Error during campaign:", error);
      setStatus({ 
        type: "error", 
        message: `Campaign stopped due to error. Sent ${sentCount} / ${totalToSend} emails before failing.` 
      });
    } finally {
      setSending(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Email Composer</h2>
        <p className="text-sm text-muted-foreground">
          Use variables like &#123;&#123;name&#125;&#125;, &#123;&#123;company&#125;&#125; for personalization
        </p>
      </div>

      {status && (
        <Alert
          className={
            status.type === "success"
              ? "border-green-200 bg-green-50 dark:bg-green-950"
              : status.type === "error"
                ? "border-red-200 bg-red-50 dark:bg-red-950"
                : "border-blue-200 bg-blue-50 dark:bg-blue-950"
          }
        >
          {status.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription
            className={
              status.type === "success"
                ? "text-green-800 dark:text-green-200"
                : status.type === "error"
                  ? "text-red-800 dark:text-red-200"
                  : "text-blue-800 dark:text-blue-200"
            }
          >
            {status.message}
          </AlertDescription>
        </Alert>
      )}

      {sending && (
        <Card className="p-4 flex flex-col items-center space-y-3">
          <div className="flex items-center space-x-2 text-primary">
            <Spinner className="w-5 h-5" />
            <p className="font-semibold">Sending Campaign... ({progress} / {totalToSend})</p>
          </div>
          <div className="w-full h-2 bg-muted rounded-full">
            <div 
              className="h-2 bg-primary rounded-full transition-all duration-300 ease-linear" 
              style={{ width: `${(progress / totalToSend) * 100}%` }}
            />
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject..." disabled={sending} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Image URL (optional)</label>
            <Input
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={sending}
            />
            {imageUrl && (
              <div className="mt-2 text-xs text-muted-foreground">
                Preview:{" "}
                <img
                  src={imageUrl || "/placeholder.svg"}
                  alt="Preview"
                  className="h-16 mt-1 rounded"
                  onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Body</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMarkdownGuide(!showMarkdownGuide)}
                className="text-xs h-6"
              >
                {showMarkdownGuide ? "Hide" : "Show"} Markdown Guide
              </Button>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body... Use markdown formatting"
              className="w-full h-64 p-3 border border-input rounded-lg bg-background font-mono text-sm resize-none"
              disabled={sending}
            />
          </div>

          {showMarkdownGuide && (
            <Card className="p-3 bg-muted/50 border-muted-foreground/20">
              <p className="text-xs font-medium mb-2">Markdown Formatting Guide:</p>
              <div className="text-xs space-y-1 text-muted-foreground font-mono">
                <div>
                  **bold text** → <strong>bold text</strong>
                </div>
                <div>
                  *italic text* → <em>italic text</em>
                </div>
                <div>{"[Link](https://example.com) → Link with URL"}</div>
                <div># Heading 1 → Large heading</div>
                <div>## Heading 2 → Medium heading</div>
                <div>### Heading 3 → Small heading</div>
              </div>
            </Card>
          )}

          {allVariables.length > 0 && (
            <div className="bg-muted p-3 rounded text-sm">
              <div className="font-medium mb-2">Variables used: {allVariables.join(", ")}</div>
              <div className="text-xs text-muted-foreground">These will be replaced for each recipient</div>
            </div>
          )}

          <Button 
            onClick={prepareContactsForPreview} 
            disabled={sending || !config || !contacts.length} 
            className="w-full"
          >
            <Send className="w-4 h-4 mr-2" />
            {sending ? "Sending..." : `Send Campaign to ${isTestingMode ? '(Max ' + MAX_TEST_CAMPAIGN_SIZE + ')' : ''}`}
          </Button>
          {isTestingMode && (
             <p className="text-xs text-center text-muted-foreground mt-2">
               * In Testing Mode, only the first {MAX_TEST_CAMPAIGN_SIZE} contacts will be included.
             </p>
          )}
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Live Preview</h3>
            <Card className="p-4 space-y-3 bg-white dark:bg-slate-950">
              {previewContact ? (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground">Subject (for {previewContact.name}):</div>
                    <div className="font-semibold">{previewContact.personalizedSubject}</div>
                  </div>
                  {imageUrl && (
                    <div>
                      <img
                        src={imageUrl || "/placeholder.svg"}
                        alt="Email preview"
                        className="w-full rounded max-h-48 object-cover"
                        onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                      />
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <div className="text-xs text-muted-foreground mb-2">Body:</div>
                    <div
                      className="text-sm whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: applyMarkdown(previewContact.personalizedBody),
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">Load contacts or enter template to preview.</div>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Campaign Confirmation Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" /> Confirm Campaign Send
            </DialogTitle>
            <DialogDescription>
              Review the recipients and email content before confirming.
            </DialogDescription>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="grid grid-cols-1 md:grid-cols-2 p-6 gap-6 max-h-[70vh] overflow-y-auto">
            {/* Left: Recipient List */}
            <div className="space-y-3 border-r pr-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Recipients ({selectedContacts.filter(c => c.checked).length} selected)</h3>
                <Button variant="ghost" size="sm" onClick={() => handleSelectAll(selectedContacts.some(c => !c.checked))}>
                  {selectedContacts.some(c => !c.checked) ? "Select All" : "Deselect All"}
                </Button>
              </div>
              {isTestingMode && (
                <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                        Testing Mode active: Only the first {MAX_TEST_CAMPAIGN_SIZE} contacts are available. Sending rate is limited to 10/min.
                    </AlertDescription>
                </Alert>
              )}
              <ScrollArea className="h-[400px] border rounded-lg p-2">
                <div className="space-y-1">
                  {selectedContacts.map(contact => (
                    <div 
                      key={contact.email} 
                      className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => setPreviewContact(contact)}
                    >
                      <Checkbox 
                        checked={contact.checked} 
                        onCheckedChange={(checked: boolean) => handleToggleContact(contact.email, checked)} 
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{contact.name}</span>
                        <span className="text-xs text-muted-foreground">{contact.email}</span>
                      </div>
                      {previewContact?.email === contact.email && <ChevronsRight className="ml-auto w-4 h-4 text-primary" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Right: Email Preview */}
            <div className="space-y-3">
              <h3 className="text-lg font-medium">Email Preview</h3>
              <Card className="p-4 space-y-3 bg-white dark:bg-slate-950">
                {previewContact ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{previewContact.name} &lt;{previewContact.email}&gt;</span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="text-xs text-muted-foreground">Subject:</div>
                      <div className="font-semibold">{previewContact.personalizedSubject}</div>
                    </div>
                    {imageUrl && (
                      <div className="pt-3">
                        <img
                          src={imageUrl || "/placeholder.svg"}
                          alt="Email image"
                          className="w-full rounded max-h-48 object-cover"
                          onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                        />
                      </div>
                    )}
                    <div className="border-t pt-3">
                      <div className="text-xs text-muted-foreground mb-2">Body:</div>
                      <div
                        className="text-sm"
                        dangerouslySetInnerHTML={{
                          __html: applyMarkdown(previewContact.personalizedBody),
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">Select a contact to view personalized preview.</div>
                )}
              </Card>
            </div>
          </div>

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSend} disabled={selectedContacts.filter(c => c.checked).length === 0}>
              Confirm Send ({selectedContacts.filter(c => c.checked).length} Emails)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}