// shaibal-tiller/email-sender/email-sender-2c729b716bad772b42daa15e94a023a390ca7702/components/email/contacts-tab.tsx

"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import { Upload, Download, Trash2, RefreshCw, CheckCircle2, Info, Loader2, Users, Check, Clock, X } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"

interface Contact {
  email: string
  name: string
  customFields?: Record<string, string>
  sent_count?: number
  pending_count?: number
  failed_count?: number
}

// Helper to generate sample data
const generateSampleContacts = () => {
    const contacts: Contact[] = []
    for (let i = 1; i <= 100; i++) {
      contacts.push({
        email: `user${i}@example.com`,
        name: `User ${i}`,
        customFields: { company: `Company ${Math.ceil(i / 10)}` },
        sent_count: Math.floor(Math.random() * 5),
        pending_count: Math.floor(Math.random() * 2),
        failed_count: Math.floor(Math.random() * 1),
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
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [contactsToPreview, setContactsToPreview] = useState<Contact[]>([])
  const [isParsing, setIsParsing] = useState(false)
  
  // State for Multi-Select/Delete
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  
  // New state for adding a single contact
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContact, setNewContact] = useState({
      name: '',
      email: '',
      company: '',
  });


  // Load contacts from API
  const loadContacts = async () => {
    setIsLoading(true);
    setSelectedForDelete([]); // Clear selection on reload
    try {
      const response = await fetch("/api/contacts")
      if (response.ok) {
        const data = await response.json()
        // Contacts returned from the API have custom_fields, convert to customFields
        const normalizedData: Contact[] = data.map((d: any) => ({
          email: d.email,
          name: d.name,
          customFields: d.custom_fields,
          sent_count: d.sent_count,
          pending_count: d.pending_count,
          failed_count: d.failed_count,
        }))
        setContacts(normalizedData)
        setSyncStatus(null);
      } else {
        setContacts(generateSampleContacts())
        setSyncStatus({ type: "info", message: "Failed to load contacts from database. Loaded sample data." })
      }
    } catch (error) {
      console.error("Error loading contacts:", error)
      setContacts(generateSampleContacts())
      setSyncStatus({ type: "info", message: "Network error loading contacts. Loaded sample data." })
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadContacts()
  }, [])

  // New function for adding a single contact
  const handleAddSingleContact = async () => {
    if (!newContact.email || !newContact.name) {
      setSyncStatus({ type: "error", message: "Name and Email are required." });
      return;
    }

    const contactToAdd: Contact = {
        name: newContact.name.trim(),
        email: newContact.email.trim(),
        customFields: {
            // Only add company if it is provided
            ...(newContact.company.trim() && { company: newContact.company.trim() }),
        },
    };

    setSyncing(true);
    setSyncStatus({ type: "info", message: `Attempting to add or update ${contactToAdd.email}...` });
    setIsAddModalOpen(false);

    try {
        const response = await fetch("/api/contacts/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Send as an array for the bulk upsert endpoint
            body: JSON.stringify({ contacts: [contactToAdd] }),
        });

        if (response.ok) {
            setSyncStatus({ type: "success", message: `Successfully added or updated contact ${contactToAdd.email}.` });
            loadContacts();
            setNewContact({ name: '', email: '', company: '' }); // Clear form
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || "Add/Update failed");
        }
    } catch (error) {
        console.error("Add/Update error:", error);
        setSyncStatus({ type: "error", message: `Failed to add contact: ${error instanceof Error ? error.message : 'Unknown error'}` });
        setIsAddModalOpen(true); // Reopen on error
    } finally {
        setSyncing(false);
        setTimeout(() => setSyncStatus(null), 5000);
    }
  };

  // Toggle selection for bulk delete
  const handleToggleSelect = (email: string, checked: boolean) => {
    setSelectedForDelete(prev => 
        checked 
            ? [...prev, email] 
            : prev.filter(e => e !== email)
    );
  }
  
  const handleSelectAllForDelete = (checked: boolean) => {
      if (checked) {
          const allEmails = filteredContacts.map(c => c.email);
          setSelectedForDelete(allEmails);
      } else {
          setSelectedForDelete([]);
      }
  }


  // Handle Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedForDelete.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedForDelete.length} contacts from the database? This cannot be undone.`)) {
        return;
    }

    setSyncing(true);
    setSyncStatus({ type: "info", message: `Starting deletion of ${selectedForDelete.length} contacts...` });

    let deletedCount = 0;
    try {
        for (const email of selectedForDelete) {
            const response = await fetch("/api/contacts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            if (response.ok) {
                deletedCount++;
            } else {
                console.error(`Failed to delete ${email}`);
            }
        }
        
        if (deletedCount > 0) {
            setSyncStatus({ type: "success", message: `Successfully deleted ${deletedCount} contacts.` });
            loadContacts(); // Reloads data and clears selection
        } else {
            setSyncStatus({ type: "error", message: "No contacts were successfully deleted." });
        }
        
    } catch (error) {
        console.error("Bulk delete error:", error);
        setSyncStatus({ type: "error", message: `Failed to complete bulk deletion: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
        setSyncing(false);
        setSelectedForDelete([]);
        setTimeout(() => setSyncStatus(null), 5000);
    }
  }
  
  // Remaining Handlers (same logic as previous versions)

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

  const handleConfirmSync = async () => {
    setIsPreviewModalOpen(false); 
    
    if (contactsToPreview.length === 0) {
        setSyncStatus({ type: "info", message: "Preview list is empty, nothing to sync." });
        return;
    }
    
    await handleSyncToDb(contactsToPreview);
  }

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
        loadContacts();
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
        ...c.customFields 
    })))
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `contacts-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const filteredContacts = useMemo(() => {
    return contacts.filter(
        (c) =>
            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [contacts, searchTerm])

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

      {/* Actions and Bulk Delete */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* New Add Single Contact Button */}
        <Button variant="default" onClick={() => {
            setSyncStatus(null);
            setIsAddModalOpen(true);
        }} disabled={syncing}>
            <Users className="w-4 h-4 mr-2" />
            Add Single Contact
        </Button>
        
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
        
        {/* Bulk Delete Button */}
        <Button 
          variant="destructive" 
          onClick={handleBulkDelete} 
          disabled={syncing || selectedForDelete.length === 0}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete Selected ({selectedForDelete.length})
        </Button>
      </div>

      {/* Contact List */}
      <div>
        <div className="flex gap-2 items-center mb-4">
            <Input
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
              disabled={syncing}
            />
            <div className="flex items-center space-x-2 flex-shrink-0">
                <Checkbox 
                    id="select-all" 
                    checked={selectedForDelete.length > 0 && selectedForDelete.length === filteredContacts.length}
                    onCheckedChange={(checked: boolean) => handleSelectAllForDelete(checked)}
                />
                <label htmlFor="select-all" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Select All ({filteredContacts.length})
                </label>
            </div>
        </div>
        
        <ScrollArea className="h-96 border rounded-lg p-4">
          <div className="flex flex-wrap gap-4 p-2">
            {filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground w-full">No contacts found. Upload a CSV or sync data.</div>
            ) : (
                filteredContacts.map((contact) => (
                    <div 
                        key={contact.email} 
                        className="text-sm p-3 bg-muted rounded hover:bg-muted/80 border flex w-full sm:w-[calc(50%-8px)] lg:w-[calc(33.33%-10.66px)] items-start relative"
                    >
                        {/* Checkbox for Bulk Delete */}
                        <div className="flex-shrink-0 pt-1 mr-3">
                            <Checkbox 
                                checked={selectedForDelete.includes(contact.email)}
                                onCheckedChange={(checked: boolean) => handleToggleSelect(contact.email, checked)}
                            />
                        </div>
                        
                        {/* Contact Info and Custom Fields */}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{contact.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{contact.email}</div>
                            {Object.keys(contact.customFields || {}).length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                    {Object.entries(contact.customFields || {})
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" • ")}
                                </div>
                            )}
                            
                            {/* Stats */}
                            <div className="flex items-center gap-3 text-xs font-mono mt-2">
                                <div className="flex items-center text-green-600" title="Emails Sent Successfully">
                                    <Check className="w-3 h-3 mr-1" />
                                    <span>{contact.sent_count || 0}</span>
                                </div>
                                <div className="flex items-center text-yellow-600" title="Emails Scheduled / Pending">
                                    <Clock className="w-3 h-3 mr-1" />
                                    <span>{contact.pending_count || 0}</span>
                                </div>
                                <div className="flex items-center text-red-600" title="Emails Failed">
                                    <X className="w-3 h-3 mr-1" />
                                    <span>{contact.failed_count || 0}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* CSV Preview Dialog (for upload process - unchanged) */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Review Contacts Before Sync
            </DialogTitle>
            <DialogDescription>
              A total of {contactsToPreview.length} contacts were parsed from the CSV. Confirm to overwrite/update existing contacts in the database.
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
      
      {/* New: Add Single Contact Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Add New Contact
            </DialogTitle>
            <DialogDescription>
              Enter the details for a single contact. This will overwrite existing data for the same email.
            </DialogDescription>
          </DialogHeader>

          <Separator className="mx-6" />

          <div className="p-6 pt-0 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name <span className="text-red-500">*</span></label>
              <Input
                placeholder="John Doe"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                disabled={syncing}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email <span className="text-red-500">*</span></label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                disabled={syncing}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Company (Custom Field)</label>
              <Input
                placeholder="Acme Corp"
                value={newContact.company}
                onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                disabled={syncing}
              />
            </div>
          </div>

          <DialogFooter className="p-6 pt-0">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)} disabled={syncing}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddSingleContact} 
              disabled={syncing || !newContact.email || !newContact.name}>
              {syncing ? <><Spinner className="w-4 h-4 mr-2" /> Adding...</> : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}