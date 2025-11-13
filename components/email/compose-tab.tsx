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
  CheckCircle2,
  Lock,
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

interface Contact {
  email: string
  name: string
  custom_fields: Record<string, string>
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
  isTestingMode: boolean
}

const MAX_TEST_CAMPAIGN_SIZE = 5;
const THROTTLING_DELAY_MS = 6000;

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

  rawContent = rawContent.replace(
    /^([০-৯]+\।\s*.*?)$/gm,
    "<h3 style='margin: 15px 0 10px; font-size: 18px; line-height: 1.2;'>$1</h3>"
  )

  const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)([^]*?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;

  rawContent = rawContent.replace(listBlockRegex, (match, header, content) => {
    content = content.trim();
    if (!content) return header;

    const listItems = content.split(/\n/);


    const listHtml = listItems
      .filter((item: any) => item.trim() !== '')
      .map((item: any) => `<li>${item.trim()}</li>`)
      .join('');

    return `${header}<ul style="padding-left: 20px; margin: 5px 0 15px; list-style-type: disc;">${listHtml}</ul>\n`;
  });

  rawContent = rawContent.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  )

  rawContent = rawContent.replace(/\n/g, "<br/>")

  rawContent = rawContent.replace(/<br\/><h3/g, '<h3')
  rawContent = rawContent.replace(/<\/h3><br\/>/g, '</h3>')

  return rawContent;
}

export default function ComposeTab({ config, isTestingMode }: ComposeTabProps) {
  const [subject, setSubject] = useState("আসন্ন বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP) নির্বাচনে আপনার মূল্যবান সমর্থন প্রত্যাশা করছি")
  const [body, setBody] = useState(
    `**প্রিয় {{name}}**,
     আসসালামু আলাইকুম। আশা করছি আপনি ভালো আছেন।

বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP)-কে একটি **স্বচ্ছ, জবাবদিহিমূলক, পেশাগতভাবে শক্তিশালী এবং আন্তর্জাতিকভাবে সংযুক্ত প্রতিষ্ঠান** হিসেবে গড়ে তোলার লক্ষ্য নিয়ে আমি আসন্ন নির্বাচনে **সহ-সভাপতি (VP-II)** পদে প্রার্থী হয়েছি।
আমাদের পেশা, আমাদের প্রতিষ্ঠান এবং আমাদের সদস্যদের মর্যাদা রক্ষার জন্য আমি কিছু অগ্রাধিকারমূলক প্রতিশ্রুতি নিয়ে কাজ করতে চাই:

১। পরিকল্পনা: মানসম্মত স্থানিক পরিকল্পনা চর্চা
জাতীয়–আঞ্চলিক–স্থানীয় স্তরে **Spatial Planning Framework** প্রতিষ্ঠা
**Land Use** ও **Zoning**-এর একীভূত সংজ্ঞা ও শ্রেণিবিন্যাস
পরিকল্পনার জন্য **Standard ToR, Data Specification & Methodology** নির্ধারণ
RAJUK, UDD, LGED ইত্যাদি সংস্থার অভিন্ন পরিকল্পনা প্রস্তুত প্রক্রিয়া
BBRA এর ভবন নকশা প্রক্রিয়ায় **Licensed Planners** - দের বাধ্যতামূলকভাবে অন্তর্ভুক্ত

২। পরিকল্পনাবিদ: ক্ষমতায়ন, কল্যাণ ও পেশাগত মর্যাদা
নীতিনির্ধারণে পরিকল্পনাবিদদের প্রতিনিধিত্ব বৃদ্ধি
সরকারি (BCS) ও উন্নয়ন সংস্থায় **Planners’ posts** সৃষ্টির চলমান প্রক্রিয়া অব্যাহত রাখা
**Welfare Fund**, আইনি সুরক্ষা ও সদস্য কল্যাণ ব্যবস্থা
**Standard Salary Structure, Consultancy Fee Guideline** প্রণয়ন ও প্রচার
**Young Planners Mentorship Program** ও পেশাগত বিশেষায়ন
পরিকল্পনা পেশাজীবী, উন্নয়নকর্মী ও অন্যান্য পেশায় নিয়োজিত পরিকল্পনাবিদ —সব সদস্যের সমান মর্যাদা

৩। প্রতিষ্ঠান: শক্তিশালী শাসনব্যবস্থা ও কার্যকর পরিচালনা
**Standing Committee, Technical Working Group** ও **Subcommittee** গঠন
সংগঠনের নীতি ও প্রক্রিয়ার হালনাগাদ
আধুনিক ও কার্যকর **BIP Secretariat** গঠন
**Executive Committee**-এর জবাবদিহিতা সাধারণ সদস্যদের প্রতি নিশ্চিতকরণ
সদস্যদের আরও অর্থবহ অংশগ্রহণের জন্য meet the member, কনসালটেশন ও ফিডব্যাক সিস্টেম চালু

৪। BIP Watch: উন্নয়ন পর্যবেক্ষণ ও জনস্বার্থ রক্ষা
বিভিন্ন পরিকল্পনা ও প্রকল্প পর্যালোচনা ও পেশাগত মতামত
অনুমোদিত পরিকল্পনার সাথে অসামঞ্জস্যপূর্ণ উন্নয়ন প্রতিরোধ
পরিবেশ, দূষণ, অনিয়ম—এসব বিষয়ে সচেতনতা ও অ্যাডভোকেসি
মিডিয়ার সাথে জনস্বার্থভিত্তিক কার্যক্রম জোরদার

৫। বৈশ্বিক সংযোগ ও জাতীয় ব্র্যান্ডিং
APA, RTPI, ISOCARP-এর সাথে আন্তর্জাতিক অংশীদারিত্ব
**Planner** পেশার জাতীয় পরিচিতি ও মর্যাদা বৃদ্ধি
তরুণদের **Planning Profession**-এ আকৃষ্ট করার উদ্যোগ

আপনার সমর্থন কেন গুরুত্বপূর্ণ?
কারণ **BIP** আমাদের সবার।সদস্যদের মতামত, অংশগ্রহণ এবং প্রত্যাশাই একটি শক্তিশালী পেশাগত কমিউনিটি গড়ে তোলে।আমি প্রতিশ্রুতি দিচ্ছি— **সদস্যদের সম্পৃক্ততা, অংশগ্রহণ, স্বচ্ছতা ও জবাবদিহিতাই হবে আমার কাজের মূল চালিকা শক্তি।**

**আপনার মূল্যবান সমর্থন প্রত্যাশা করছি**
আপনার মতামত, পরামর্শ বা প্রত্যাশা জানালে আমি অত্যন্ত কৃতজ্ঞ থাকবো।একটি উন্নত, শক্তিশালী এবং সদস্যকেন্দ্রিক BIP গঠনে আপনার ভোট ও সমর্থন আমার জন্য অত্যন্ত গুরুত্বপূর্ণ।
শুভেচ্ছা ও আন্তরিক কৃতজ্ঞতাসহ, 
**তামজিদুল ইসলাম**
প্রার্থী, সহ-সভাপতি (VP-II)
বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP)`
  )
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContacts, setSelectedContacts] = useState<SelectedContact[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [totalToSend, setTotalToSend] = useState(0)
  const [previewContact, setPreviewContact] = useState<SelectedContact | null>(null)
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
  const [imageUrl, setImageUrl] = useState("https://38y39fcx57.ufs.sh/f/mMGqMdgQNemikJNpBtzqlJrgITZDsSjhbB7K9eUa3MdxPvqL")
  const [secretCode, setSecretCode] = useState("")
  const [verificationError, setVerificationError] = useState<string | null>(null)
  const [previewVariables, setPreviewVariables] = useState<{ name: string; company: string }>({
    name: "John Doe",
    company: "Acme Corp",
  })

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

  useEffect(() => {
    if (selectedContacts.length > 0) {
      setPreviewContact(selectedContacts[0]);
    } else if (contacts.length > 0) {
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
        checked: true,
        personalizedSubject: replaceVariables(subject, allFields),
        personalizedBody: replaceVariables(body, allFields),
      };
    });

    setSelectedContacts(preparedContacts);
    setVerificationError(null);
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

  const verifyAndSend = async () => {
    const recipients = selectedContacts.filter(c => c.checked);
    if (recipients.length === 0) {
      setVerificationError("No recipients selected for sending.");
      return;
    }

    setSending(true);
    setVerificationError(null);

    if (!isTestingMode) {
      const verificationResponse = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretCode: secretCode }),
      });

      if (!verificationResponse.ok) {
        setSending(false);
        setVerificationError("Verification failed: Network error.");
        return;
      }

      const verificationData = await verificationResponse.json();

      if (!verificationData.verified) {
        setSending(false);
        setVerificationError(verificationData.error || "Secret code is invalid.");
        return;
      }

      if (verificationData.error) {
        setStatus({ type: "info", message: verificationData.error });
      }
    }

    if (!config) {
      setSending(false);
      setStatus({ type: "error", message: "Configuration missing. Cannot proceed." });
      setIsModalOpen(false);
      return;
    }

    setIsModalOpen(false);
    setProgress(0);
    setTotalToSend(recipients.length);
    let sentCount = 0;

    try {
      for (let i = 0; i < recipients.length; i++) {
        const contact = recipients[i];

        if (isTestingMode && i > 0) {
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
      setSecretCode("");
    }
  }


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Email Composer</h2>
        <p className="text-sm text-muted-foreground">
          Use variables like &#123;&#123;name&#125;&#123;, &#123;&#123;company&#125;&#123; for personalization
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
                  className="w-full max-h-32 object-contain mt-1 rounded"
                  onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Body (Enter HTML, Plain Text, **bold**, or 1। Heading)</label>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body... Enter HTML, Plain Text, **bold**, or 1। Heading"
              className="w-full h-64 p-3 border border-input rounded-lg bg-background font-mono text-sm resize-none"
              disabled={sending}
            />
          </div>

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
                  <div className="border-t pt-3">
                    <div className="text-xs text-muted-foreground mb-2">Body:</div>
                    <div
                      className="text-sm"
                      dangerouslySetInnerHTML={{
                        __html: processEmailBodyForPreview(previewContact.personalizedBody),
                      }}
                    />
                  </div>
                  {imageUrl && (
                    <div className="pt-3 border-t">
                      <img
                        src={imageUrl || "/placeholder.svg"}
                        alt="Email preview"
                        className="w-full h-auto max-h-[400px] object-contain"
                        onError={(e) => (e.currentTarget.src = "/placeholder.svg")}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">Load contacts or enter template to preview.</div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] sm:max-w-[80vw] p-0"
        >
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
                    <div className="border-t pt-3">
                      <div className="text-xs text-muted-foreground mb-2">Body:</div>
                      <div
                        className="text-sm"
                        dangerouslySetInnerHTML={{
                          __html: processEmailBodyForPreview(previewContact.personalizedBody),
                        }}
                      />
                    </div>
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
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">Select a contact to view personalized preview.</div>
                )}
              </Card>
            </div>
          </div>

          {!isTestingMode && (
            <div className="p-6 pt-0 space-y-3">
              <Separator />
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">
                    Secret Code
                  </label>
                  <Input
                    type="password"
                    placeholder="Enter secret code to confirm bulk send"
                    value={secretCode}
                    onChange={(e) => {
                      setSecretCode(e.target.value);
                      setVerificationError(null);
                    }}
                    disabled={sending}
                  />
                  {verificationError && (
                    <p className="text-xs text-red-500 mt-1">{verificationError}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Set the <code>SEND_SECRET_CODE</code> environment variable on your server to enable security for bulk sending.
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={verifyAndSend} disabled={sending || selectedContacts.filter(c => c.checked).length === 0 || (!isTestingMode && !secretCode)}>
              {sending ? (
                <><Spinner className="w-4 h-4 mr-2" /> Sending...</>
              ) : (
                `Confirm & Send (${selectedContacts.filter(c => c.checked).length} Emails)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}