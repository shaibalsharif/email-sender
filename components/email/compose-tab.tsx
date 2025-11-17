"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import {
  AlertCircle,
  User,
  ChevronsRight,
  Eye,
  Paperclip,
  X,
  Users,
  Mail,
  Package,
  Zap,
  Clock,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

import { useSecretVerification } from "@/components/security/use-secret-verification"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { DEFAULT_EMAIL_BODY } from "@/lib/emailBodyTemplate"
import { Badge } from "../ui/badge"

interface Contact {
  email: string
  name: string
  custom_fields: Record<string, string>
}

interface ComposeTabProps {
  config: {
    mailgunDomain: string
    fromEmail: string
    fromName: string
    isFromEnv: boolean
  } | null
  isTestingMode: boolean
}

const MAX_TEST_CAMPAIGN_SIZE = 100;

const ANIMALS = ["Lion", "Tiger", "Bear", "Wolf", "Eagle", "Shark", "Panda", "Koala", "Zebra", "Dolphin"];
const FLOWERS = ["Rose", "Tulip", "Lily", "Daisy", "Orchid", "Jasmine", "Sunflower", "Marigold", "Lavender", "Poppy"];

// Batch configuration presets
const BATCH_PRESETS = {
  legacy: {
    batchSize: 12,
    intervalMinutes: 7,
    label: "Legacy (12 emails / 7 min)",
    description: "Original batching system with conservative limits"
  },
  standard: {
    batchSize: 200,
    intervalMinutes: 10,
    label: "Standard (200 emails / 10 min)",
    description: "Recommended for most campaigns with lifted limits"
  }
}

const getUniqueBatchName = () => {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const flower = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
  return `${animal}-${flower}-${Date.now().toString(36).slice(-5)}`;
};

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

const processEmailBodyForPreview = (content: string): string => {
  if (!content) return ''
  let rawContent = content;
  rawContent = rawContent.replace(/^([০-৯]+\।\s*.*?)$/gm, "<h3 style='margin: 15px 0 10px; font-size: 18px; line-height: 1.2;'>$1</h3>")
  const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)((?:[^\n].*\n?)+?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;
  rawContent = rawContent.replace(listBlockRegex, (match, header, content) => {
    content = content.trim();
    if (!content) return header;
    const listItems = content.split(/\n/);
    const listHtml = listItems.filter((item: any) => item.trim() !== '').map((item: any) => `<li>${item.trim()}</li>`).join('');
    return `${header}<ul style="padding-left: 20px; margin: 5px 0 15px; list-style-type: disc;">${listHtml}</ul>\n`;
  });
  rawContent = rawContent.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  rawContent = rawContent.replace(/\n/g, "<br/>")
  rawContent = rawContent.replace(/<br\/><h3/g, '<h3')
  rawContent = rawContent.replace(/<\/h3><br\/>/g, '</h3>')
  return rawContent;
}

export default function ComposeTab({ config, isTestingMode }: ComposeTabProps) {
  const { toast } = useToast();

  const [subject, setSubject] = useState("আসন্ন বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP) নির্বাচনে আপনার মূল্যবান সমর্থন প্রত্যাশা করছি")
  const [body, setBody] = useState(DEFAULT_EMAIL_BODY)
  const [batchMode, setBatchMode] = useState<'legacy' | 'standard'>('standard')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactEmails, setSelectedContactEmails] = useState<string[]>([]);
  const [isMailPreviewOpen, setIsMailPreviewOpen] = useState(false);
  const [isContactSelectionOpen, setIsContactSelectionOpen] = useState(false);
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [schedulingLoading, setSchedulingLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [totalBatchCount, setTotalBatchCount] = useState(0)
  const [previewContact, setPreviewContact] = useState<Contact | null>(null)
  const [imageUrl, setImageUrl] = useState("https://38y39fcx57.ufs.sh/f/mMGqMdgQNemikJNpBtzqlJrgITZDsSjhbB7K9eUa3MdxPvqL")
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [companyFilters, setCompanyFilters] = useState<Record<string, boolean>>({});

  const { requireVerification, VerificationDialog } = useSecretVerification()

  const currentBatchConfig = BATCH_PRESETS[batchMode];

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch("/api/contacts")
        if (response.ok) {
          const data = await response.json()
          setContacts(data)
          const companies = new Set<string>();
          data.forEach((c: any) => {
            if (c.custom_fields?.company) companies.add(c.custom_fields.company);
          });
          const filterObj: Record<string, boolean> = {};
          companies.forEach(c => (filterObj[c] = true));
          filterObj["none"] = true;
          setCompanyFilters(filterObj);

        } else {
          setContacts([])
        }
      } catch (error) {
        setContacts([])
        toast({
          title: "Error loading contacts",
          description: "Network error occurred while fetching contacts.",
          variant: "destructive",
        })
      }
    }
    loadContacts()
  }, [])

  const contactsToSchedule = useMemo(() => {
    let contactsToUse = contacts;
    if (isTestingMode) {
      contactsToUse = contacts.slice(0, MAX_TEST_CAMPAIGN_SIZE);
    }
    return contactsToUse;
  }, [contacts, isTestingMode]);

  const uniqueCompanies = useMemo(() => {
    const companies = new Set<string>();
    contacts.forEach(c => {
      if (c.custom_fields.company) {
        companies.add(c.custom_fields.company);
      }
    });
    return Array.from(companies).sort();
  }, [contacts]);

  const filteredContactsInModal = useMemo(() => {
    const base = contactsToSchedule.filter(c =>
      (c.email.toLowerCase().includes(contactSearchTerm.toLowerCase()) ||
        c.name.toLowerCase().includes(contactSearchTerm.toLowerCase())) &&
      (
        Object.keys(companyFilters).every(key => companyFilters[key] === true) ||
        (c.custom_fields?.company && companyFilters[c.custom_fields.company]) ||
        (!c.custom_fields.company && companyFilters["none"])
      )
    );

    // ⭐ Sort so that selected contacts appear first
    return base.sort((a, b) => {
      const aChecked = selectedContactEmails.includes(a.email);
      const bChecked = selectedContactEmails.includes(b.email);
      return Number(bChecked) - Number(aChecked);
    });
  }, [contactsToSchedule, contactSearchTerm, companyFilters, selectedContactEmails]);


  const dynamicPreview = useMemo(() => {
    const contact = previewContact || contactsToSchedule[0] || { name: "Recipient", email: "example@email.com", custom_fields: {} as Record<string, string> };
    const allFields = { name: contact.name, email: contact.email, ...contact.custom_fields };
    return {
      contact,
      personalizedSubject: replaceVariables(subject, allFields),
      personalizedBody: replaceVariables(body, allFields),
    };
  }, [previewContact, contactsToSchedule, subject, body]);

  const allVariables = useMemo(() => {
    return [...new Set([...getVariables(subject), ...getVariables(body)])]
  }, [subject, body])

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 20 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Attachment file size must be less than 20MB.",
        variant: "destructive",
      });
      setAttachmentFile(null);
      event.target.value = '';
      return;
    }
    setAttachmentFile(file);
  };

  const handleEditorProceed = () => {
    if (!config || !config.mailgunDomain || !config.fromEmail) {
      toast({
        title: "Configuration Error",
        description: "Missing configuration. Check the Configuration tab.",
        variant: "destructive",
      });
      return;
    }
    if (contacts.length === 0) {
      toast({
        title: "Contact Error",
        description: "No contacts available. Upload a CSV in the Contacts tab.",
        variant: "destructive",
      });
      return;
    }
    setSelectedContactEmails(contactsToSchedule.map(c => c.email));
    setIsContactSelectionOpen(true);
  }

  const handlePreviewOpen = () => {
    if (!config || !config.mailgunDomain || !config.fromEmail) {
      toast({
        title: "Configuration Error",
        description: "Missing configuration. Check the Configuration tab.",
        variant: "destructive",
      });
      return;
    }
    if (!previewContact) {
      setPreviewContact(contactsToSchedule[0]);
    }
    setIsMailPreviewOpen(true);
  }

  const handlePreviewConfirm = () => {
    setIsMailPreviewOpen(false);
    setSelectedContactEmails(contactsToSchedule.map(c => c.email));
    setIsContactSelectionOpen(true);
  }

  const handleToggleContact = (email: string, checked: boolean) => {
    setSelectedContactEmails(prev =>
      checked ? [...prev, email] : prev.filter(e => e !== email)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedContactEmails(checked ? filteredContactsInModal.map(c => c.email) : []);
  };

  const prepareBatches = async () => {
    const recipients = contactsToSchedule.filter((c) => selectedContactEmails.includes(c.email))


    if (recipients.length === 0) {
      setVerificationError("No recipients selected for scheduling.")
      return
    }
    setVerificationError(null)


    const ok = await requireVerification({ actionLabel: `schedule ${recipients.length} emails to Local History` })
    if (!ok) {
      return
    }
    setSchedulingLoading(true)

    const totalRecipients = recipients.length
    const batchSize = currentBatchConfig.batchSize
    const numBatches = Math.ceil(totalRecipients / batchSize)
    setTotalBatchCount(numBatches)

    const recordsToLog: any[] = []
    let validationFailedCount = 0

    // Prepare all batches
    for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
      setBatchProgress(batchIndex + 1)

      const startIdx = batchIndex * batchSize
      const endIdx = Math.min(startIdx + batchSize, totalRecipients)
      const batchRecipients = recipients.slice(startIdx, endIdx)
      const batchName = getUniqueBatchName()

      const invalidRecipients = batchRecipients.filter((r) => {
        const allFields = { name: r.name, email: r.email, ...r.custom_fields }
        const personalizedSubject = replaceVariables(subject, allFields)
        const personalizedBody = replaceVariables(body, allFields)


        return (
          personalizedSubject.match(/\{\{.*?\}\}/g) ||
          personalizedBody.match(/\{\{.*?\}\}/g)
        )
      })


      if (invalidRecipients.length > 0) {
        validationFailedCount += invalidRecipients.length
        batchRecipients.forEach((r) =>
          recordsToLog.push({
            ...r,
            status: "validation_failed",
            batchName,
            batchIndex: batchIndex + 1,
            batchMode,
          }),
        )
        continue
      }


      batchRecipients.forEach((r) => {
        recordsToLog.push({
          recipient: r.email,
          recipientName: r.name,
          subject: subject,
          body: body,
          custom_fields: r.custom_fields,
          status: "pending",
          batchName,
          batchIndex: batchIndex + 1,
          batchMode,
        })
      })
    }

    // Log all records to database
    try {
      const dbPromises = recordsToLog.map((record: any) => {
        return fetch("/api/contacts/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: record.recipient,
            recipientName: record.recipientName,
            subject: record.subject,
            body: record.body,
            imageUrl: imageUrl,
            status: record.status,
            batchName: record.batchName,
            batchIndex: record.batchIndex,
            attachmentFileName: attachmentFile?.name || null,
            batchMode: record.batchMode || batchMode,
          }),
        })
      })


      await Promise.all(dbPromises)


      // Store attachment and batch config in session storage
      if (attachmentFile) {
        const reader = new FileReader()
        reader.onload = () => {
          sessionStorage.setItem("campaignAttachment", reader.result as string)
          sessionStorage.setItem("campaignAttachmentName", attachmentFile.name)
        }
        reader.readAsDataURL(attachmentFile)
      }

      sessionStorage.setItem("batchMode", batchMode)
    } catch (e) {
      console.error("Failed to log records to DB:", e)
      toast({
        title: "DB Error",
        description: "Could not log all records to Local History.",
        variant: "destructive",
      })
    }


    setSchedulingLoading(false)


    if (validationFailedCount > 0) {
      toast({
        title: "Validation Failed!",
        description: `${validationFailedCount} emails failed validation. Check Local History.`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Batches Prepared Successfully!",
      description: `${numBatches} batches (${totalRecipients} emails) prepared. Go to Scheduled tab to send.`,
      variant: "default",
    });

    setIsContactSelectionOpen(false);

  }

  const isButtonDisabled = schedulingLoading || !config || !contacts.length;
  const selectedCount = selectedContactEmails.length;
  const estimatedBatches = Math.ceil(selectedCount / currentBatchConfig.batchSize);

  return (
    <div className="space-y-6">

      {schedulingLoading && (
        <Card className="p-4 flex flex-col items-center space-y-3">
          <div className="flex items-center space-x-2 text-primary">
            <Spinner className="w-5 h-5" />
            <p className="font-semibold">
              Preparing Batches... ({batchProgress} of {totalBatchCount})
            </p>
          </div>
          <div className="w-full h-2 bg-muted rounded-full">
            <div
              className="h-2 bg-primary rounded-full transition-all duration-300 ease-linear"
              style={{ width: `${(batchProgress / totalBatchCount) * 100}%` }}
            />
          </div>
        </Card>
      )}

      {/* Batch Mode Selection */}
      <Card className="p-6 space-y-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Batching Configuration</h3>
        </div>

        <RadioGroup value={batchMode} onValueChange={(v) => setBatchMode(v as 'legacy' | 'standard')}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className={`flex items-start space-x-3 space-y-0 rounded-lg border-2 p-4 cursor-pointer transition-all ${batchMode === 'legacy' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
              }`} onClick={() => setBatchMode('legacy')}>
              <RadioGroupItem value="legacy" id="legacy" />
              <Label htmlFor="legacy" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">{BATCH_PRESETS.legacy.label}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {BATCH_PRESETS.legacy.description}
                </p>
              </Label>
            </div>

            <div className={`flex items-start space-x-3 space-y-0 rounded-lg border-2 p-4 cursor-pointer transition-all 
            ${batchMode === 'standard' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
              }`} onClick={() => setBatchMode('standard')}>
              <RadioGroupItem value="standard" id="standard" />
              <Label htmlFor="standard" className="cursor-pointer flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="font-semibold">{BATCH_PRESETS.standard.label}</span>
                  <Badge variant="secondary" className="bg-green-600 text-white text-xs">Recommended</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {BATCH_PRESETS.standard.description}
                </p>
              </Label>
            </div>
          </div>
        </RadioGroup>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold mb-2">Email Content Editor</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4 md:col-span-2">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject..." disabled={schedulingLoading} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Image URL (optional)</label>
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  disabled={schedulingLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Attachment (Max 20MB)</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full relative"
                    disabled={schedulingLoading}
                    onClick={() => document.getElementById('attachment-file-input')?.click()}
                  >
                    <Paperclip className="w-4 h-4 mr-2" />
                    {attachmentFile ? attachmentFile.name : 'Select File'}
                  </Button>
                  <input
                    id="attachment-file-input"
                    type="file"
                    accept=".pdf, image/*, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleAttachmentChange}
                  />
                  {attachmentFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setAttachmentFile(null)}
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">Body (Enter HTML, Plain Text, **bold**, or 1। Heading)</label>
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body... Enter HTML, Plain Text, **bold**, or 1। Heading"
                className="w-full h-96 p-3 border border-input rounded-lg bg-background font-mono text-sm resize-none"
                disabled={schedulingLoading}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <Card className="p-4 space-y-3">
            <div className="font-medium mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Available Variables
            </div>
            <div className="text-sm">
              {allVariables.length > 0 ? (
                <p>Use any of these variables in your Subject or Body: <strong>{allVariables.join(", ")}</strong></p>
              ) : (
                <p className="text-muted-foreground">Start using {'{{name}}'} or other custom fields in your email body to see variables appear here.</p>
              )}
            </div>
            <Separator />
            <div className="font-medium flex items-center gap-2">
              <Package className="w-4 h-4" /> Batch Processing
            </div>
            <p className="text-sm text-muted-foreground">
              Current mode: <strong>{currentBatchConfig.label}</strong>
              <br />
              Emails will be divided into batches of <strong>{currentBatchConfig.batchSize}</strong>
              with <strong>{currentBatchConfig.intervalMinutes} minute</strong> intervals between batches.
            </p>
          </Card>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <Button
          onClick={handlePreviewOpen}
          disabled={isButtonDisabled}
          variant="outline"
          className="flex-1"
        >
          <Eye className="w-4 h-4 mr-2" /> Preview
        </Button>
        <Button
          onClick={handleEditorProceed}
          disabled={isButtonDisabled}
          className="flex-1"
        >
          Confirm & Proceed <ChevronsRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Preview Modal */}
      <Dialog open={isMailPreviewOpen} onOpenChange={setIsMailPreviewOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[90vw] p-0">
          <DialogHeader className="p-6 pb-0 flex-row items-center justify-between !gap-4">
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" /> Full Email Preview
              </DialogTitle>
              <DialogDescription>
                Review the final email content and structure.
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsMailPreviewOpen(false)} size="sm">
                Cancel
              </Button>
              <Button onClick={handlePreviewConfirm} size="sm">
                Confirm & Select Recipients <ChevronsRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="grid grid-cols-1 md:grid-cols-2 p-6 gap-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-3 md:col-span-2">
              <Card className="p-4 space-y-3 bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{dynamicPreview.contact.name} &lt;{dynamicPreview.contact.email}&gt;</span>
                </div>
                <div className="border-t pt-3">
                  <div className="text-xs text-muted-foreground">Subject:</div>
                  <div className="font-semibold">{dynamicPreview.personalizedSubject}</div>
                </div>
                {attachmentFile && (
                  <div className="text-xs text-muted-foreground flex items-center pt-3 border-t">
                    <Paperclip className="w-3 h-3 mr-1" />
                    Attachment: {attachmentFile.name} ({Math.ceil(attachmentFile.size / 1024)} KB)
                  </div>
                )}
              </Card>

              <Card className="p-4 space-y-3 bg-white dark:bg-slate-950 border">
                <div className="text-xs text-muted-foreground mb-2">Rendered HTML Body:</div>
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{
                    __html: processEmailBodyForPreview(dynamicPreview.personalizedBody),
                  }}
                />
                {imageUrl && (
                  <div className="pt-3 border-t">
                    <img
                      src={imageUrl || "/placeholder.svg"}
                      alt="Email image"
                      className="w-full h-auto max-h-[400px] object-contain"
                      onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                    />
                  </div>
                )}
              </Card>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contact Selection Modal */}
      <Dialog open={isContactSelectionOpen} onOpenChange={setIsContactSelectionOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[90vw] p-0">
          <DialogHeader className="p-6 pb-0 flex-row items-center justify-between !gap-4">
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Select Recipients
              </DialogTitle>
              <DialogDescription>
                Select recipients. Emails will be divided into batches of {currentBatchConfig.batchSize}.
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsContactSelectionOpen(false)} disabled={schedulingLoading} size="sm">
                Cancel
              </Button>
              <Button
                onClick={prepareBatches}
                disabled={schedulingLoading || selectedCount === 0}
                size="sm"
              >
                {schedulingLoading ? (
                  <><Spinner className="w-4 h-4 mr-2" /> Preparing...</>
                ) : (
                  `Prepare ${estimatedBatches} Batches (${selectedCount} Emails)`
                )}
              </Button>
            </div>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {verificationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{verificationError}</AlertDescription>
              </Alert>
            )}

            <Card className="p-4">
              <div className="text-sm space-y-2">
                <p><strong>Selected:</strong> {selectedCount} recipients</p>
                <p><strong>Batches:</strong> {estimatedBatches} batches of {currentBatchConfig.batchSize} emails</p>
                <p className="text-muted-foreground text-xs">Each batch requires confirmation in the Scheduled tab with
                  ~{currentBatchConfig.intervalMinutes}-minute intervals.</p>
              </div>
            </Card>

            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Recipients</h3>
              <Button variant="ghost" size="sm" onClick={() => handleSelectAll(selectedCount === 0)}>
                {selectedCount === 0 ? "Select All" : "Deselect All"} ({selectedCount})
              </Button>
            </div>

            <div className="flex gap-4">
              <Input
                placeholder="Search by name or email..."
                value={contactSearchTerm}
                onChange={(e) => setContactSearchTerm(e.target.value)}
                className="flex-1"
              />
              <div className="flex flex-wrap gap-3">
                {Object.keys(companyFilters).map(company => (
                  <label
                    key={company}
                    className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={companyFilters[company]}
                      onChange={() =>
                        setCompanyFilters(prev => ({
                          ...prev,
                          [company]: !prev[company]
                        }))
                      }
                    />
                    <span className="text-sm">
                      {company === "none" ? "No Company Tag" : company}
                    </span>
                  </label>
                ))}
              </div>

            </div>

            <ScrollArea className="h-[400px] border rounded-lg p-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                {filteredContactsInModal.map((contact, idx) => (
                  <div
                    key={contact.email}
                    className="relative flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer border"
                    onClick={() => {
                      const isChecked = selectedContactEmails.includes(contact.email);
                      handleToggleContact(contact.email, !isChecked);
                      setPreviewContact(contact);
                    }}
                  >
                    <div className="absolute -left-2 -top-2 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded shadow">
                      {idx + 1}
                    </div>
                    <Checkbox
                      checked={selectedContactEmails.includes(contact.email)}
                      onCheckedChange={(checked: boolean) => {
                        handleToggleContact(contact.email, checked);
                      }}
                    />
                    <div className="flex flex-col flex-1 min-w-0 truncate">
                      <span className="font-medium text-sm truncate">{contact.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                    </div>
                  </div>
                ))}
                {filteredContactsInModal.length === 0 && (
                  <div className="col-span-2 text-center py-8 text-muted-foreground">
                    No contacts match your search query.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
      {VerificationDialog}
    </div>
  )
}