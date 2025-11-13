"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Upload, Download, Trash2, RefreshCw, CheckCircle2, Info, Loader2, Mail, Users } from "lucide-react"
import Papa from "papaparse"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

interface Contact {
  email: string
  name: string
  customFields?: Record<string, string>
}

const generateSampleContacts = () => {
    const contacts: Contact[] = []
    for (let i = 1; i <= 100; i++) {
      contacts.push({
        email: `user${i}@example.com`,
        name: `User ${i}`,
        customFields: { company: `Company ${Math.ceil(i / 10)}` },
      })
    }
    return contacts
}


export default function ContactsTab() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [syncing, setSyncing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null)
  
  // New state for the CSV upload preview workflow
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [contactsToPreview, setContactsToPreview] = useState<Contact[]>([])
  const [isParsing, setIsParsing] = useState(false)


  // Load contacts from API only
  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch("/api/contacts")
        if (response.ok) {
          const data = await response.json()
          // Contacts returned from the API have custom_fields, convert to customFields
          const normalizedData = data.map((d: any) => ({
            email: d.email,
            name: d.name,
            customFields: d.custom_fields,
          }))
          setContacts(normalizedData)
        } else {
          setContacts(generateSampleContacts())
          setSyncStatus({ type: "info", message: "Failed to load contacts from database. Loaded sample data." })
        }
      } catch (error) {
        console.error("Error loading contacts:", error)
        setContacts(generateSampleContacts())
        setSyncStatus({ type: "info", message: "Network error loading contacts. Loaded sample data." })
      } finally {
        setIsLoading(false)
      }
    }

    loadContacts()
  }, [])

  // 1. Handle CSV Upload -> Trigger Preview Modal
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsParsing(true);
    setSyncStatus({ type: "info", message: `Parsing CSV file: ${file.name}...` });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: Contact[] = results.data
          .filter((row: any) => row.email)
          .map((row: any) => ({
            email: row.email?.trim(),
            name: row.name?.trim() || row.email?.split("@")[0],
            customFields: Object.keys(row)
              .filter((k) => k !== "email" && k !== "name" && row[k])
              .reduce((acc: any, k) => ({ ...acc, [k]: row[k] }), {}),
          }))
          
        setIsParsing(false);
        setContactsToPreview(parsed);
        setIsPreviewModalOpen(true);
        setSyncStatus(null);
      },
      error: (error) => {
        setIsParsing(false);
        setSyncStatus({ type: "error", message: `CSV Parsing failed: ${error.message}` });
      }
    })
  }

  // 2. Handle Confirmation from Preview Modal -> Trigger Sync
  const handleConfirmSync = async () => {
    setIsPreviewModalOpen(false); // Close modal
    
    if (contactsToPreview.length === 0) {
        setSyncStatus({ type: "info", message: "Preview list is empty, nothing to sync." });
        return;
    }
    
    // Pass the parsed contacts to the synchronization function
    await handleSyncToDb(contactsToPreview);
    
    // After successful sync, refresh the main contacts list to the newly synced data
    if (syncStatus?.type === "success") {
        setContacts(contactsToPreview);
    }
  }


  // Helper to sync contacts state to DB
  const handleSyncToDb = async (contactsToSync: Contact[] = contacts) => {
    if (contactsToSync.length === 0) {
        setSyncStatus({ type: "info", message: "Contact list is empty. Nothing to synchronize." });
        return;
    }

    setSyncing(true)
    setSyncStatus({ type: "info", message: `Starting synchronization of ${contactsToSync.length} contacts...` });

    try {
      const response = await fetch("/api/contacts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contactsToSync }),
      })

      if (response.ok) {
        setSyncStatus({ type: "success", message: `Successfully synced ${contactsToSync.length} contacts to database.` })
        // On success, update the main list
        setContacts(contactsToSync); 
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Sync failed");
      }
    } catch (error) {
      console.error("Sync error:", error);
      setSyncStatus({ type: "error", message: `Failed to sync contacts: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  const handleDownload = () => {
    const csv = Papa.unparse(contacts.map(c => ({
        email: c.email,
        name: c.name,
        // Flatten custom fields for export
        ...c.customFields 
    })))
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const handleClear = () => {
    // Note: Clearing contacts now means wiping the local cache, 
    // and a follow-up "Sync to DB" is required to delete all contacts in the DB.
    if (confirm("Clear local contact list? You must click 'Sync to DB' afterward to permanently remove all contacts from the database.")) {
      // Clear local state immediately
      setContacts([])
      setSyncStatus({ type: "info", message: "Contacts cleared locally. Click 'Sync to DB' to empty the database." })
      setTimeout(() => setSyncStatus(null), 5000)
    }
  }

  const filteredContacts = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (isLoading) {
    return <div className="text-center py-8 flex justify-center items-center gap-2"><Loader2 className="animate-spin w-5 h-5" /> Loading contacts...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Contact Management</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {contacts.length} contacts loaded • {filteredContacts.length} shown
        </p>
      </div>

      {syncStatus && (
        <Alert
          className={
            syncStatus.type === "success"
              ? "border-green-200 bg-green-50 dark:bg-green-950"
              : syncStatus.type === "error"
                ? "border-red-200 bg-red-50 dark:bg-red-950"
                : "border-blue-200 bg-blue-50 dark:bg-blue-950"
          }
        >
          {syncStatus.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          <AlertDescription
            className={
              syncStatus.type === "success"
                ? "text-green-800 dark:text-green-200"
                : syncStatus.type === "error"
                  ? "text-red-800 dark:text-red-200"
                  : "text-blue-800 dark:text-blue-200"
            }
          >
            {syncStatus.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Guide Card */}
      <Card className="p-4 bg-muted/50 border-muted-foreground/20">
        <div className="flex gap-2 mb-3">
          <Info className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium mb-2">CSV Structure Guide</p>
            <p className="text-xs text-muted-foreground mb-2">Your CSV file must have at least these columns:</p>
            <code className="bg-background p-2 rounded text-xs block text-foreground font-mono">
              email,name,company{"\n"}
              john@example.com,John Doe,Acme Corp{"\n"}
              jane@example.com,Jane Smith,Tech Inc
            </code>
            <p className="text-xs text-muted-foreground mt-2">
              • <strong>email</strong> (required) - Recipient email address{"\n"}• <strong>name</strong> (optional) -
              Will use email prefix if missing{"\n"}• Additional columns become available as personalization variables
            </p>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <label className="cursor-pointer">
          <Button variant="outline" asChild disabled={isParsing || syncing}>
            <div>
              {isParsing ? (
                <Spinner className="w-4 h-4 mr-2" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isParsing ? "Parsing..." : "Upload CSV"}
            </div>
          </Button>
          <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" onClick={(e) => (e.currentTarget.value = '')} />
        </label>

        <Button variant="outline" onClick={handleDownload} disabled={contacts.length === 0 || syncing}>
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>

        <Button 
          variant="outline" 
          onClick={() => handleSyncToDb(contacts)} 
          disabled={syncing || contacts.length === 0}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync to DB"}
        </Button>

        <Button variant="destructive" size="sm" onClick={handleClear} disabled={syncing}>
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Local
        </Button>
      </div>

      {/* Contact List */}
      <div>
        <Input
          placeholder="Search by email or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-4"
          disabled={syncing}
        />
        <ScrollArea className="h-96 border rounded-lg p-4">
          <div className="space-y-2">
            {filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No contacts found. Upload a CSV or sync data.</div>
            ) : (
                filteredContacts.map((contact, idx) => (
                    <div key={contact.email + idx} className="text-sm p-3 bg-muted rounded hover:bg-muted/80">
                        <div className="font-medium">{contact.name}</div>
                        <div className="text-xs text-muted-foreground">{contact.email}</div>
                        {Object.keys(contact.customFields || {}).length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                                {Object.entries(contact.customFields || {})
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" • ")}
                            </div>
                        )}
                    </div>
                ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* CSV Preview Dialog */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Review Contacts Before Sync
            </DialogTitle>
            <DialogDescription>
              A total of {contactsToPreview.length} contacts were parsed from the CSV. Confirm to overwrite the existing contacts in the database.
            </DialogDescription>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="p-6 pt-0">
             <ScrollArea className="h-[400px] border rounded-lg">
                <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-secondary/90 border-b">
                        <tr>
                            <th className="p-3">Name</th>
                            <th className="p-3">Email</th>
                            {contactsToPreview.length > 0 && 
                                Object.keys(contactsToPreview[0]?.customFields || {}).map((key) => (
                                    <th key={key} className="p-3">{key}</th>
                                ))
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {contactsToPreview.map((contact, index) => (
                            <tr key={contact.email + index} className="border-b last:border-b-0 hover:bg-muted/50">
                                <td className="p-3 font-medium">{contact.name}</td>
                                <td className="p-3 text-muted-foreground">{contact.email}</td>
                                {contactsToPreview.length > 0 && 
                                    Object.keys(contactsToPreview[0]?.customFields || {}).map((key) => (
                                        <td key={key} className="p-3 text-xs">{contact.customFields?.[key] || '-'}</td>
                                    ))
                                }
                            </tr>
                        ))}
                    </tbody>
                </table>
              </ScrollArea>
          </div>

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setIsPreviewModalOpen(false)} disabled={syncing}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSync} disabled={syncing || contactsToPreview.length === 0}>
              {syncing ? (
                <><Spinner className="w-4 h-4 mr-2" /> Syncing...</>
              ) : (
                `Confirm & Sync ${contactsToPreview.length} Contacts`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}