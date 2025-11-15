// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/compose-tab.tsx

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
  ChevronsRight,
  CheckCircle2,
  Lock,
  Hourglass,
  Clock,
  BatteryCharging,
  Zap,
  Mail,
  Users,
  Eye,
  Calendar,
  Paperclip,
  Check,
  X,
  Database,
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
import { useToast } from "@/hooks/use-toast" // IMPORTED useToast
import { startOfHour } from 'date-fns'; // IMPORTED startOfHour

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

// Default Constants
const DEFAULT_MAX_EMAILS_PER_HOUR = 100; // Used as the rate limit
const DEFAULT_BATCH_DELAY_HOURS = 1;
const MAX_TEST_CAMPAIGN_SIZE = 100;
const BATCH_INTERVAL_HOURS = 1; // Fixed interval as per request


// --- NEW HELPER FUNCTIONS FOR BATCH NAMING AND DYNAMIC SCHEDULING ---

const ANIMALS = ["Lion", "Tiger", "Bear", "Wolf", "Eagle", "Shark", "Panda", "Koala", "Zebra", "Dolphin", "Cheetah", "Jaguar", "Raccoon", "Sloth", "Fox", "Hawk", "Cobra", "Moose", "Goat", "Badger"];
const FLOWERS = ["Rose", "Tulip", "Lily", "Daisy", "Orchid", "Jasmine", "Sunflower", "Marigold", "Lavender", "Poppy", "Iris", "Dahlia", "Violet", "Peony", "Crocus", "Hyacinth", "Freesia", "Azalea", "Lilac", "Begonia"];

const getUniqueBatchName = () => {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const flower = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
    return `${animal}-${flower}-${Date.now().toString(36).slice(-5)}`;
};

// --- END NEW HELPER FUNCTIONS ---


// Helper functions (kept the same logic)
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

  const listBlockRegex = /(<h3[^>]*>.*?<\/h3>\n)((?:[^\n].*\n?)+?)(?=(<h3[^>]*>.*?<\/h3>|\n{2,}|$))/g;

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
  const { toast } = useToast(); 
  
  const [subject, setSubject] = useState("আসন্ন বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP) নির্বাচনে আপনার মূল্যবান সমর্থন প্রত্যাশা করছি")
  const [body, setBody] = useState(
    `**প্রিয় {{name}}**,
     আসসালামু আলাইকুম。 আশা করছি আপনি ভালো আছেন。

বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP)-কে একটি **স্বচ্ছ, জবাবদিহিমূলক, পেশাগতভাবে শক্তিশালী এবং আন্তর্জাতিকভাবে সংযুক্ত প্রতিষ্ঠান** হিসেবে গড়ে তোলার লক্ষ্য নিয়ে আমি আসন্ন নির্বাচনে **সহ-সভাপতি (VP-II)** পদে প্রার্থী হয়েছি。
আমাদের পেশা, আমাদের প্রতিষ্ঠান এবং আমাদের সদস্যদের মর্যাদা রক্ষার জন্য আমি কিছু অগ্রাধিকারমূলক প্রতিশ্রুতি নিয়ে কাজ করতে চাই:

১。 পরিকল্পনা: মানসম্মত স্থানিক পরিকল্পনা চর্চা
জাতীয়–আঞ্চলিক–স্থানীয় স্তরে **Spatial Planning Framework** প্রতিষ্ঠা
**Land Use** ও **Zoning**-এর একীভূত সংজ্ঞা ও শ্রেণিবিন্যাস
পরিকল্পনার জন্য **Standard ToR, Data Specification & Methodology** নির্ধারণ
RAJUK, UDD, LGED ইত্যাদি সংস্থার অভিন্ন পরিকল্পনা প্রস্তুত প্রক্রিয়া
BBRA এর ভবন নকশা প্রক্রিয়ায় **Licensed Planners** - দের বাধ্যতামূলকভাবে অন্তর্ভুক্ত

২。 পরিকল্পনাবিদ: ক্ষমতায়ন, কল্যাণ ও পেশাগত মর্যাদা
নীতিনির্ধারণে পরিকল্পনাবিদদের প্রতিনিধিত্ব বৃদ্ধি
সরকারি (BCS) ও উন্নয়ন সংস্থায় **Planners’ posts** সৃষ্টির চলমান প্রক্রিয়া অব্যাহত রাখা
**Welfare Fund**, আইনি সুরক্ষা ও সদস্য কল্যাণ ব্যবস্থা
**Standard Salary Structure, Consultancy Fee Guideline** প্রণয়ন ও প্রচার
**Young Planners Mentorship Program** ও পেশাগত বিশেষায়ন
পরিকল্পনা পেশাজীবী, উন্নয়নকর্মী ও অন্যান্য পেশায় নিয়োজিত পরিকল্পনাবিদ —সব সদস্যের সমান মর্যাদা

৩。 প্রতিষ্ঠান: শক্তিশালী শাসনব্যবস্থা ও কার্যকর পরিচালনা
**Standing Committee, Technical Working Group** ও **Subcommittee** গঠন
সংগঠনের নীতি ও প্রক্রিয়ার হালনাগাদ
আধুনিক ও কার্যকর **BIP Secretariat** গঠন
**Executive Committee**-এর জবাবদিহিতা সাধারণ সদস্যদের প্রতি নিশ্চিতকরণ
সদস্যদের আরও অর্থবহ অংশগ্রহণের জন্য meet the member, কনসালটেশন ও ফিডব্যাক সিস্টেম চালু

৪。 BIP Watch: উন্নয়ন পর্যবেক্ষণ ও জনস্বার্থ রক্ষা
বিভিন্ন পরিকল্পনা ও প্রকল্প পর্যালোচনা ও পেশাগত মতামত
অনুমোদিত পরিকল্পনার সাথে অসামঞ্জস্যপূর্ণ উন্নয়ন প্রতিরোধ
পরিবেশ, দূষণ, অনিয়ম—এসব বিষয়ে সচেতনতা ও অ্যাডভোকেসি
মিডিয়ার সাথে জনস্বার্থভিত্তিক কার্যক্রম জোরদার

৫。 বৈশ্বিক সংযোগ ও জাতীয় ব্র্যান্ডিং
APA, RTPI, ISOCARP-এর সাথে আন্তর্জাতিক অংশীদারিত্ব
**Planner** পেশার জাতীয় পরিচিতি ও মর্যাদা বৃদ্ধি
তরুণদের **Planning Profession**-এ আকৃষ্ট করার উদ্যোগ

আপনার সমর্থন কেন গুরুত্বপূর্ণ?
কারণ **BIP** আমাদের সবার。সদস্যদের মতামত, অংশগ্রহণ এবং প্রত্যাশাই একটি শক্তিশালী পেশাগত কমিউনিটি গড়ে তোলে。আমি প্রতিশ্রুতি দিচ্ছি— **সদস্যদের সম্পৃক্ততা, অংশগ্রহণ, স্বচ্ছতা ও জবাবদিহিতাই হবে আমার কাজের মূল চালিকা শক্তি。**

**আপনার মূল্যবান সমর্থন প্রত্যাশা করছি**
আপনার মতামত, পরামর্শ বা প্রত্যাশা জানালে আমি অত্যন্ত কৃতজ্ঞ থাকবো。একটি উন্নত, শক্তিশালী এবং সদস্যকেন্দ্রিক BIP গঠনে আপনার ভোট ও সমর্থন আমার জন্য অত্যন্ত গুরুত্বপূর্ণ。
শুভেচ্ছা ও আন্তরিক কৃতজ্ঞতাসহ, 
**তামজিদুল ইসলাম**
প্রার্থী, সহ-সভাপতি (VP-II)
বাংলাদেশ ইনস্টিটিউট অব প্ল্যানার্স (BIP)`
  )
  const [contacts, setContacts] = useState<Contact[]>([])
  
  // New single source of truth for selected emails in modal
  const [selectedContactEmails, setSelectedContactEmails] = useState<string[]>([]);
  
  // Modal State Control
  const [isMailPreviewOpen, setIsMailPreviewOpen] = useState(false); // Stage 1 Modal
  const [isContactSelectionOpen, setIsContactSelectionOpen] = useState(false); // Stage 2 Modal
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  
  // New state for company filtering
  const [companyFilter, setCompanyFilter] = useState("all");
  
  // --- NEW ATTACHMENT STATE ---
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  // Configurable Batch States
  // FIX: DEFAULT_MAX_EMAILS_PER_HOUR is used as the batch size (e.g., 100)
  const [batchSizeInput, setBatchSizeInput] = useState(DEFAULT_MAX_EMAILS_PER_HOUR.toString());
  const [batchDelayHoursInput, setBatchDelayHoursInput] = useState(DEFAULT_BATCH_DELAY_HOURS.toString());
  const [customStartTimeInput, setCustomStartTimeInput] = useState(''); 
  const [customStartError, setCustomStartError] = useState<string | null>(null); 
  const [schedulingConflict, setSchedulingConflict] = useState<string | null>(null);
  const [batchSettingsError, setBatchSettingsError] = useState<string | null>(null);

  // Progress States
  const [schedulingLoading, setSchedulingLoading] = useState(false) // General loading state
  const [progress, setProgress] = useState(0) 
  const [totalRecipients, setTotalRecipients] = useState(0) 
  const [totalBatches, setTotalBatches] = useState(0) 

  const [previewContact, setPreviewContact] = useState<Contact | null>(null)
  const [imageUrl, setImageUrl] = useState("https://38y39fcx57.ufs.sh/f/mMGqMdgQNemikJNpBtzqlJrgITZDsSjhb7K9eUa3MdxPvqL")
  const [secretCode, setSecretCode] = useState("")
  const [verificationError, setVerificationError] = useState<string | null>(null)


  // --- Data Loading and Initialization (unchanged) ---

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch("/api/contacts")
        if (response.ok) {
          const data = await response.json()
          setContacts(data)
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

  // Memoized full contact list (filtered for testing mode)
  const contactsToSchedule = useMemo(() => {
    let contactsToUse = contacts;
    if (isTestingMode) {
      contactsToUse = contacts.slice(0, MAX_TEST_CAMPAIGN_SIZE);
    }
    return contactsToUse;
  }, [contacts, isTestingMode]);
  
  // Memoized available unique companies
  const uniqueCompanies = useMemo(() => {
      const companies = new Set<string>();
      contacts.forEach(c => {
          if (c.custom_fields.company) {
              companies.add(c.custom_fields.company);
          }
      });
      return Array.from(companies).sort();
  }, [contacts]);

  // Memoized contacts for the modal grid view
  const filteredContactsInModal = useMemo(() => {
    return contactsToSchedule
        .filter(c => 
            (c.email.toLowerCase().includes(contactSearchTerm.toLowerCase()) || 
            c.name.toLowerCase().includes(contactSearchTerm.toLowerCase())) &&
            // Apply Company Filter
            (companyFilter === "all" || (companyFilter === "none" && !c.custom_fields.company) || (c.custom_fields.company === companyFilter))
        )
  }, [contactsToSchedule, contactSearchTerm, companyFilter])


  // Calculate dynamic preview contact data
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


  // --- Scheduling Conflict Logic (Uses fetchScheduledDeliveries) ---

  const fetchScheduledDeliveries = async () => {
    try {
        const response = await fetch("/api/email-history")
        if (response.ok) {
            const history = await response.json();
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);
            
            return history
                .flatMap((h: any) => h.records.filter((r: any) => {
                    // FIX: Ensure valid date objects before comparison and only use valid timestamps
                    const scheduledTime = r.scheduled_at ? new Date(r.scheduled_at).getTime() : NaN;
                    const sentTime = r.sent_at ? new Date(r.sent_at).getTime() : NaN;
                    
                    const isFutureScheduled = r.status === 'scheduled' && scheduledTime > now;
                    const isRecentSent = r.status === 'sent' && sentTime > oneHourAgo;
                    
                    return (isFutureScheduled || isRecentSent) && !isNaN(scheduledTime);
                }).map((r: any) => r.scheduled_at ? new Date(r.scheduled_at).getTime() : new Date(r.sent_at).getTime()));
        }
    } catch (error) {
        console.error("Error fetching scheduled deliveries:", error);
    }
    return [];
  }
  
  // --- Custom Start Time Validation (REMOVED, as custom start field is removed) ---

  const handleBatchSettingsChange = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setBatchSettingsError(null);
    if (value === '' || /^\d+$/.test(value) || /^\d+\.\d*$/.test(value)) {
      setter(value);
    } else {
      if (value !== '') {
        setBatchSettingsError("Batch inputs must be valid numbers.");
      }
    }
  }

  // --- File Input Handler (unchanged) ---
  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 20 * 1024 * 1024) { // Mailgun free tier limit is 25MB, set soft limit at 20MB
      toast({
        title: "File Too Large",
        description: "Attachment file size must be less than 20MB.",
        variant: "destructive",
      });
      setAttachmentFile(null);
      event.target.value = ''; // Clear the input field
      return;
    }
    setAttachmentFile(file);
  };
  // --- End File Input Handler ---


  // --- Navigation & State Handlers (unchanged) ---

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
    // Set default selection to all valid contacts
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
    // Reset preview to a default contact if not set
    if (!previewContact) {
        setPreviewContact(contactsToSchedule[0]);
    }
    setIsMailPreviewOpen(true);
  }
  
  const handlePreviewConfirm = () => {
    setIsMailPreviewOpen(false);
    
    // Set default selection to all valid contacts before opening stage 2
    setSelectedContactEmails(contactsToSchedule.map(c => c.email));
    setIsContactSelectionOpen(true);
  }
  
  // FIX for Issue 4: Updates the source of truth (email array) correctly
  const handleToggleContact = (email: string, checked: boolean) => {
    setSelectedContactEmails(prev => 
        checked 
            ? [...prev, email]
            : prev.filter(e => e !== email)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedContactEmails(checked ? filteredContactsInModal.map(c => c.email) : []);
  };


  // --- Final Send Logic: LOCAL SCHEDULING AND VALIDATION ---

  const verifyAndSend = async () => {
    const recipients = contactsToSchedule.filter(c => selectedContactEmails.includes(c.email));

    // NOTE: Max Emails per Hour is treated as the fixed batch size (e.g., 100)
    const maxEmailsPerBatch = parseInt(batchSizeInput);
    
    if (recipients.length === 0) {
      setVerificationError("No recipients selected for scheduling.");
      return;
    }
    if (isNaN(maxEmailsPerBatch) || maxEmailsPerBatch <= 0) {
        setVerificationError("Max Emails per Hour must be a positive whole number.");
        return;
    }

    setSchedulingLoading(true); 
    setVerificationError(null);
    
    // 1. Fetch current last scheduled time to determine start of new campaign
    const scheduledTimestamps = await fetchScheduledDeliveries();
    
    const recipientsTotal = recipients.length;
    
    // Determine the baseline time for the first batch:
    let currentBatchTime: number; 

    if (scheduledTimestamps.length === 0) {
        // CASE 1: No previous schedules/sends. First batch should be 'sent right away'.
        currentBatchTime = Date.now() + 1000; // 1 second in the future (immediate)
    } else {
        // CASE 2: History exists. Subsequent batches start 1 hour after the absolute last time.
        const lastScheduledTime = Math.max(...scheduledTimestamps);
        currentBatchTime = lastScheduledTime + BATCH_INTERVAL_HOURS * 60 * 60 * 1000;
        
        // Ensure the calculated start time is not in the past (e.g., if the last mail was 2 hours ago, start 1 hour ago + 1 hour = now)
        if (currentBatchTime < Date.now()) {
             currentBatchTime = Date.now() + 1000; // Start immediately if overdue
        }
    }
    
    
    // 2. Divide into Batches and Validate/Log to Database
    let recipientsIndex = 0;
    const recordsToLog:any = [];
    const batchesToScheduleLocally = [];
    let validationFailedCount = 0;
    let totalBatchesCreated = 0;
    const oneHourMs = 60 * 60 * 1000;
    
    while (recipientsIndex < recipientsTotal) {
        // --- FIX IMPLEMENTED HERE: Ensure correct batching based on maxEmailsPerBatch (e.g., 100) ---
        const remainingRecipients = recipientsTotal - recipientsIndex;
        // Batch size is the minimum of the fixed batch size OR the remaining recipients.
        const numRecipientsInBatch = Math.min(maxEmailsPerBatch, remainingRecipients);
        // --- END FIX ---

        const batchRecipients = recipients.slice(recipientsIndex, recipientsIndex + numRecipientsInBatch);
        const batchName = getUniqueBatchName();
        const scheduledTime = new Date(currentBatchTime);
        
        // --- VALIDATION STEP: Check for corrupted variables ---
        const invalidRecipients = batchRecipients.filter(r => {
            const allFields = { name: r.name, ...r.custom_fields };
            const personalizedSubject = replaceVariables(subject, allFields);
            const personalizedBody = replaceVariables(body, allFields);
            
            // Check for raw {{...}} tags or broken Mailgun tags
            return personalizedSubject.match(/\{\{.*?\}\}/g) || personalizedBody.match(/\{\{.*?\}\}/g) || 
                   personalizedSubject.match(/%recipient\.\{\{.*?\}\}%/g) || personalizedBody.match(/%recipient\.\{\{.*?\}\}%/g) ||
                   personalizedSubject.match(/%recipient\.{{.*?}}%/g) || personalizedBody.match(/%recipient\.{{.*?}}%/g);
        });

        if (invalidRecipients.length > 0) {
            validationFailedCount += invalidRecipients.length;
            // Mark all records in this attempted batch as validation_failed
            batchRecipients.forEach(r => recordsToLog.push({ 
                ...r, status: 'validation_failed', scheduled_at: scheduledTime, batchName 
            }));
            // Skip actual scheduling of this batch
            recipientsIndex += numRecipientsInBatch;
            currentBatchTime += oneHourMs;
            continue;
        }

        // --- SUCCESS: Schedule Locally ---
        totalBatchesCreated++;
        batchesToScheduleLocally.push({
            recipients: batchRecipients,
            scheduledAt: scheduledTime.toISOString(),
            batchName: batchName,
            isFirstBatch: totalBatchesCreated === 1,
            originalRecipients: batchRecipients, // Full data for logging
        });
        
        // Log individual records to the DB as 'scheduled'
        batchRecipients.forEach(r => recordsToLog.push({ 
            ...r, status: 'scheduled', scheduled_at: scheduledTime, batchName 
        }));
        
        recipientsIndex += numRecipientsInBatch;
        // Advance the schedule time for the NEXT batch by 1 hour
        currentBatchTime += oneHourMs;
    }
    
    // --- LOGGING ALL RECORDS (Scheduled and Failed) ---
    try {
        const dbPromises = recordsToLog.map((record: any) => {
            const allFields = { name: record.name, ...record.custom_fields };
            const personalizedSubject = replaceVariables(subject, allFields);
            const personalizedBody = replaceVariables(body, allFields);
            
            return fetch("/api/contacts/log", { // Assuming a dedicated log endpoint exists or creating one below
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({
                     recipient: record.email,
                     recipientName: record.name,
                     subject: personalizedSubject,
                     body: personalizedBody,
                     imageUrl: imageUrl,
                     status: record.status,
                     scheduled_at: record.scheduled_at,
                     batchName: record.batchName,
                 }),
            });
        });
        await Promise.all(dbPromises);
    } catch(e) {
         console.error("Failed to log records to DB:", e);
         toast({ title: "DB Error", description: "Could not log all records to Local History.", variant: "destructive" });
    }

    setTotalRecipients(recipientsTotal);
    setTotalBatches(totalBatchesCreated);

    // --- FINAL STATUS AND PROMPT ---

    setSchedulingLoading(false);
    
    if (validationFailedCount > 0) {
        toast({
            title: "Validation Failed! (Action Required)",
            description: `${validationFailedCount} emails failed the variable check and were NOT scheduled. Check Local History for details.`,
            variant: "destructive",
        });
        return;
    }
    
    if (batchesToScheduleLocally.length > 0) {
        toast({
            title: "Campaign Scheduled Locally",
            description: `${totalBatchesCreated} batches (total ${recipientsTotal} emails) scheduled locally. Check 'Scheduled' tab for next action.`,
            variant: "default",
        });
    } else {
         toast({
            title: "Scheduling Complete",
            description: `No new batches were scheduled. ${recipientsTotal} total recipients were processed.`,
            variant: "default",
        });
    }
  }

// ... (rest of the component UI and handlers remain unchanged)

  // Determine if the Confirm/Preview buttons should be disabled
  const isButtonDisabled = schedulingLoading || !config || !contacts.length;
  const selectedCount = selectedContactEmails.length;
  const maxEmailsPerHourDisplay = parseInt(batchSizeInput) || DEFAULT_MAX_EMAILS_PER_HOUR;


  return (
    <div className="space-y-6">
      
      {/* --- PROGRESS MESSAGE (Always visible in main view) --- */}
      {schedulingLoading && (
        <Card className="p-4 flex flex-col items-center space-y-3">
          <div className="flex items-center space-x-2 text-primary">
            <Spinner className="w-5 h-5" />
            <p className="font-semibold">
                Scheduling Campaign... (Batch {progress} of {totalBatches})
            </p>
          </div>
          <div className="w-full h-2 bg-muted rounded-full">
            <div
              className="h-2 bg-primary rounded-full transition-all duration-300 ease-linear"
              style={{ width: `${(progress / totalBatches) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            <Clock className="size-3 inline mr-1 align-sub" /> {totalRecipients} emails are being dynamically scheduled across future hour slots.
          </p>
        </Card>
      )}

      {/* --- STEP 1: EDITOR ITSELF ONLY (Main View) --- */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold mb-2">Email Content Editor</h2>
        
        <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column: Subject, Image, Body */}
            <div className="space-y-4 md:col-span-2">
                
                <div className="grid sm:grid-cols-3 gap-4"> {/* Adjusted grid layout for attachments */}
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
                    
                    {/* NEW: ATTACHMENT INPUT */}
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
                                accept=".pdf, image/*, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document" // Added common file types
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
                    {/* END NEW ATTACHMENT INPUT */}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium">Body (Enter HTML, Plain Text, **bold**, or 1। Heading)</label>
                    </div>
                    <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Email body... Enter HTML, Plain Text, **bold**, or 1। Heading"
                    // --- INCREASED BODY HEIGHT TO h-96 ---
                    className="w-full h-96 p-3 border border-input rounded-lg bg-background font-mono text-sm resize-none" 
                    disabled={schedulingLoading}
                    />
                </div>
            </div>
        </div>
        
        {/* Available Variables & Rate Limit Strategy (Below Editor Content) */}
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
                     <Zap className="w-4 h-4" /> Rate Limit Strategy
                </div>
                <p className="text-sm text-muted-foreground">
                    Your campaign will be automatically scheduled and managed **locally** in batches to ensure reliable delivery and adherence to hourly limits.
                </p>
            </Card>
        </div>
      </div>
      
      {/* --- ACTION BUTTONS (Below Editor) --- */}
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


      {/* --- STAGE 1 MODAL: FULL-WIDTH EMAIL PREVIEW (unchanged) --- */}
      <Dialog open={isMailPreviewOpen} onOpenChange={setIsMailPreviewOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] sm:max-w-[90vw] p-0"
        >
          <DialogHeader className="p-6 pb-0 flex-row items-center justify-between !gap-4">
            <div className="flex flex-col gap-1.5">
                <DialogTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" /> Full Email Preview
                </DialogTitle>
                <DialogDescription>
                  Review the final email content and structure.
                </DialogDescription>
            </div>
            {/* Buttons moved to Header */}
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
                {/* Subject and Recipient Banner (Actual content preview) */}
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
                
                {/* Body Preview (Actual content preview) */}
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


      {/* --- STAGE 2 MODAL: CONTACT SELECTION & SCHEDULING (FULL WIDTH GRID) --- */}
      <Dialog open={isContactSelectionOpen} onOpenChange={setIsContactSelectionOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] sm:max-w-[90vw] p-0"
        >
          <DialogHeader className="p-6 pb-0 flex-row items-center justify-between !gap-4">
            <div className="flex flex-col gap-1.5">
                <DialogTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" /> Select Recipients & Schedule Batches
                </DialogTitle>
                <DialogDescription>
                  Select the final recipients and configure the hourly sending rate. Total unique contacts: {contacts.length}
                </DialogDescription>
            </div>
            {/* Buttons moved to Header */}
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsContactSelectionOpen(false)} disabled={schedulingLoading} size="sm">
                  Cancel
                </Button>
                <Button 
                    onClick={verifyAndSend} 
                    disabled={
                        schedulingLoading || 
                        selectedCount === 0 || 
                        (!isTestingMode && !secretCode) ||
                        !!customStartError || 
                        !!batchSettingsError
                    }
                    size="sm"
                >
                    {schedulingLoading ? (
                      <><Spinner className="w-4 h-4 mr-2" /> Scheduling...</>
                    ) : (
                      `Confirm & Schedule (${selectedCount} Emails)`
                    )}
                </Button>
            </div>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="grid grid-cols-1 lg:grid-cols-3 p-6 gap-6 max-h-[70vh] overflow-y-auto">
            
            {/* COLUMN 1: Settings and Conflict Check */}
            <div className="space-y-4 lg:col-span-1 border-r lg:pr-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Rate Limit Configuration
                </h3>
                
                {(customStartError || batchSettingsError || verificationError) && (
                    <Alert variant="destructive" className="border-red-500 bg-red-100 dark:bg-red-950/50">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800 dark:text-red-200 font-semibold">
                            {customStartError || batchSettingsError || verificationError}
                        </AlertDescription>
                    </Alert>
                )}
                
                <p className="text-sm text-muted-foreground">
                    Selected Recipients: <strong>{selectedCount}</strong>
                    <br/>
                    Batches to Schedule: <strong>{Math.ceil(selectedCount / maxEmailsPerHourDisplay)}</strong>
                </p>

                <div className="space-y-4 pt-2">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Max Emails per Hour (Rate Limit)
                        </label>
                        <Input
                            type="number"
                            min="1"
                            max="1000"
                            placeholder="e.g. 100"
                            value={batchSizeInput}
                            onChange={(e) => handleBatchSettingsChange(e.target.value, setBatchSizeInput)}
                            disabled={schedulingLoading}
                        />
                         <p className="text-xs text-muted-foreground mt-1">
                            This defines the hourly rate limit the system respects (100 is standard).
                        </p>
                    </div>

                    {/* --- MAILGUN BATCH RESTRICTION WARNING --- */}
                    {config?.mailgunDomain.includes('tamzidul.com') && parseInt(batchSizeInput) > 1 && (
                        <Alert className="bg-red-50 dark:bg-red-950 border-red-200">
                            <AlertCircle className="h-4 w-4 text-red-600" />
                            <AlertDescription className="text-red-800 dark:text-red-200 text-xs font-semibold">
                                **WARNING:** Your domain is restricted. Set **Max Emails per Hour** to **1** to prevent the "Domain not allowed to send large batches" error.
                            </AlertDescription>
                        </Alert>
                    )}
                    
                    {/* CUSTOM START TIME FIELD REMOVED/SIMPLIFIED */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium">
                            First Batch Scheduled
                        </label>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Database className="w-4 h-4 text-primary" /> 
                            {/* Display calculated start time based on last scheduled email */}
                            Will start 1 hour after the absolute last scheduled/sent email.
                        </div>
                    </div>


                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Base Batch Delay (Hours)
                        </label>
                        <Input
                            type="number"
                            min="0.1"
                            step="0.1"
                            placeholder="e.g. 1.0"
                            value={batchDelayHoursInput}
                            onChange={(e) => handleBatchSettingsChange(e.target.value, setBatchDelayHoursInput)}
                            disabled={schedulingLoading}
                        />
                         <p className="text-xs text-muted-foreground mt-1">
                            Used as the fixed time interval between automatically scheduled batches.
                        </p>
                    </div>
                </div>
                
                <Card className="p-3 mt-4">
                    <div className="flex items-center font-semibold text-sm">
                        <Calendar className="w-4 h-4 mr-2"/> Local Scheduling Strategy
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        The system calculates scheduled times and logs them locally. Execution is triggered by the user via the **Scheduled** tab.
                    </p>
                </Card>
                
                {/* Secret Code Input */}
                {!isTestingMode && (
                  <div className="space-y-3 pt-4">
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
                          disabled={schedulingLoading}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Set the <code>SEND_SECRET_CODE</code> environment variable on your server to enable security for bulk sending.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
            </div>

            {/* COLUMN 2 & 3: Recipients List (takes up 2/3rds of space) */}
            <div className="space-y-3 lg:col-span-2">
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
                  {/* Company Filter Select */}
                  <select
                      value={companyFilter}
                      onChange={(e) => setCompanyFilter(e.target.value)}
                      className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                  >
                      <option value="all">All Companies</option>
                      {uniqueCompanies.map(company => (
                          <option key={company} value={company}>
                              {company}
                          </option>
                      ))}
                      <option value="none">No Company Tag</option>
                  </select>
              </div>

              <ScrollArea className="h-[400px] border rounded-lg p-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                  {filteredContactsInModal.map(contact => (
                    <div
                      key={contact.email}
                      className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer border"
                      onClick={() => {
                        const isChecked = selectedContactEmails.includes(contact.email);
                        handleToggleContact(contact.email, !isChecked);
                        setPreviewContact(contact); // Set preview on click
                      }}
                    >
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
                      <div className="col-span-3 text-center py-8 text-muted-foreground">
                          No contacts match your search query.
                      </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}