import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UserAvatar } from './UserAvatar';
import { usePortalStore } from '../services/store';
import { MessageAttachment, StaffUser, ChatConversation, ChatMessage } from '../types';
import {
  MessageSquare,
  Paperclip,
  Send,
  Users,
  UserPlus,
  Trash2,
  Search,
  X,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Plus,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  MoreVertical,
  Check,
  Smile,
  Hash,
  Eye,
  Download,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  ExternalLink,
  ZoomIn
} from 'lucide-react';
import { formatStaffDisplayName, formatStaffDisplayOrgDept, getStaffHierarchy } from '../utils/staffHierarchy';
import { parseUploadedFile, getAttachmentTabUrl, openAttachmentInNewTab, downloadAttachment } from '../utils/fileParser';

export const MessagesView: React.FC = () => {
  const store = usePortalStore();
  const [selectedConvId, setSelectedConvId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inChatSearch, setInChatSearch] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  
  // Mobile responsive view state: 'list' or 'chat'
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  
  // Group members modal and management
  const [showFullMembersModal, setShowFullMembersModal] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedNewMemberId, setSelectedNewMemberId] = useState('');
  
  // Group creation modal state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDept, setNewGroupDept] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState(true);

  // In-app Delete Confirmation Dialog State
  const [conversationToDelete, setConversationToDelete] = useState<ChatConversation | null>(null);

  // Enter to send toggle (defaults to false so Enter starts a new line)
  const [enterToSend, setEnterToSend] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageScrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea to fit content up to 140px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 38), 140)}px`;
    }
  }, [messageText]);

  // Auto-initialize selectedConvId if empty or no longer exists
  useEffect(() => {
    if (store.conversations && store.conversations.length > 0) {
      const exists = store.conversations.some(c => c.id === selectedConvId);
      if (!selectedConvId || !exists) {
        setSelectedConvId(store.conversations[0].id);
      }
    } else {
      setSelectedConvId('');
    }
  }, [store.conversations, selectedConvId]);

  // Active chat live synchronization pulse while user is in messages view
  useEffect(() => {
    if (!selectedConvId) return;
    const interval = setInterval(() => {
      store.actions.triggerLiveMessageSync?.();
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedConvId, store.actions]);

  // Active conversation & messages
  const conversation = useMemo(() => {
    if (!store.conversations || store.conversations.length === 0) return null;
    return store.conversations.find(c => c.id === selectedConvId) || store.conversations[0] || null;
  }, [store.conversations, selectedConvId]);

  const rawMessages = useMemo(() => {
    if (!conversation) return [];
    return store.messages?.filter(m => m.conversationId === conversation.id) || [];
  }, [store.messages, conversation]);

  // Filter messages in active chat if in-chat search is active
  const messages = useMemo(() => {
    if (!inChatSearch.trim()) return rawMessages;
    const q = inChatSearch.toLowerCase().trim();
    return rawMessages.filter(m => 
      m.text.toLowerCase().includes(q) || 
      m.senderName.toLowerCase().includes(q) ||
      (m.attachments && m.attachments.some(a => a.name.toLowerCase().includes(q)))
    );
  }, [rawMessages, inChatSearch]);

  // Auto-scroll to bottom of chat when new message arrives or conversation changes
  useEffect(() => {
    if (!inChatSearch && messageScrollContainerRef.current) {
      messageScrollContainerRef.current.scrollTo({
        top: messageScrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages.length, conversation?.id, inChatSearch]);

  // Auto-expand groups when user searches
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedGroups(true);
    }
  }, [searchQuery]);

  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    setMobileView('chat');
    setShowInChatSearch(false);
    setInChatSearch('');
  };

  // Process file attachments and parse real contents (images, pdf, docx, xlsx, text)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const fileArray = Array.from(files);
      const newAttachments: MessageAttachment[] = await Promise.all(
        fileArray.map(file => parseUploadedFile(file))
      );

      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (err) {
      console.error('Failed to parse uploaded files:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = () => {
    if ((!messageText.trim() && attachments.length === 0) || !conversation) return;
    
    // Auto preview text if only attachment sent
    const fallbackText = messageText.trim() || (attachments.length > 0 
      ? `Shared ${attachments.length === 1 ? attachments[0].name : `${attachments.length} files`}`
      : '');

    store.actions.sendMessage({
      id: `msg-${Date.now()}`,
      conversationId: conversation.id,
      senderId: store.currentUser.id,
      senderName: store.currentUser.name,
      senderAvatar: store.currentUser.avatar,
      senderRole: store.currentUser.role,
      text: fallbackText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments.length > 0 ? attachments : undefined
    });
    setMessageText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const newConvId = `conv-${Date.now()}`;
    const allParticipants = Array.from(new Set([store.currentUser.id, ...selectedStaffIds]));

    store.actions.addConversation({
      id: newConvId,
      type: 'group',
      name: newGroupName.trim(),
      department: newGroupDept || undefined,
      participantIds: allParticipants,
      lastMessage: 'Group conversation started',
      lastMessageTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0,
      createdById: store.currentUser.id,
      createdAt: new Date().toISOString()
    });

    setNewGroupName('');
    setNewGroupDept('');
    setSelectedStaffIds([]);
    setIsCreatingGroup(false);
    setSelectedConvId(newConvId);
    setMobileView('chat');
  };

  // Start or open a direct chat with a staff member
  const handleStartDirectChat = (targetStaff: StaffUser) => {
    const existing = store.conversations.find(
      c => c.type === 'direct' && c.participantIds.includes(targetStaff.id) && c.participantIds.includes(store.currentUser.id)
    );
    if (existing) {
      setSelectedConvId(existing.id);
      setMobileView('chat');
      setSearchQuery('');
    } else {
      const newDirectId = `conv-dm-${Date.now()}`;
      store.actions.addConversation({
        id: newDirectId,
        type: 'direct',
        name: formatStaffDisplayName(targetStaff),
        avatar: targetStaff.avatar,
        participantIds: [store.currentUser.id, targetStaff.id],
        lastMessage: 'Direct conversation started',
        lastMessageTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unreadCount: 0,
        createdAt: new Date().toISOString()
      });
      setSelectedConvId(newDirectId);
      setMobileView('chat');
      setSearchQuery('');
    }
  };

  // Add a member to the current group
  const handleAddMemberToGroup = () => {
    if (!selectedNewMemberId || !conversation || conversation.type !== 'group') return;
    if (conversation.participantIds.includes(selectedNewMemberId)) return;

    const updatedParticipants = [...conversation.participantIds, selectedNewMemberId];
    store.actions.updateConversation(conversation.id, {
      participantIds: updatedParticipants
    });

    const addedPerson = store.staff.find(s => s.id === selectedNewMemberId);
    store.actions.sendMessage({
      id: `msg-${Date.now()}`,
      conversationId: conversation.id,
      senderId: 'system',
      senderName: 'OfficeHub System',
      senderAvatar: store.currentUser.avatar,
      text: `${store.currentUser.name} added ${addedPerson ? formatStaffDisplayName(addedPerson) : 'a new colleague'} to the group.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    setSelectedNewMemberId('');
    setIsAddingMember(false);
  };

  // Execute deletion of conversation
  const handleConfirmDeleteConversation = () => {
    if (!conversationToDelete) return;
    const targetId = conversationToDelete.id;
    
    // Call store action
    store.actions.deleteConversation(targetId);
    
    // Switch to another conversation if currently selected
    const remaining = store.conversations.filter(c => c.id !== targetId);
    if (remaining.length > 0) {
      setSelectedConvId(remaining[0].id);
    } else {
      setSelectedConvId('');
      setMobileView('list');
    }
    setConversationToDelete(null);
  };

  // Helper: check if conversation contains messages matching search query
  const matchInMessages = (convId: string, query: string) => {
    if (!query) return false;
    return store.messages.some(m => m.conversationId === convId && m.text.toLowerCase().includes(query));
  };

  // FILTERED CONVERSATIONS & STAFF BASED ON SEARCH QUERY
  const filteredGroupConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return store.conversations.filter(c => c.type === 'group');

    return store.conversations.filter(c => {
      if (c.type !== 'group') return false;
      const matchName = c.name.toLowerCase().includes(q);
      const matchDept = (c.department || '').toLowerCase().includes(q);
      const matchLastMsg = (c.lastMessage || '').toLowerCase().includes(q);
      const matchParticipant = c.participantIds.some(pid => {
        const s = store.staff.find(staffMember => staffMember.id === pid);
        return s && (
          s.name.toLowerCase().includes(q) || 
          s.email.toLowerCase().includes(q) ||
          s.role.toLowerCase().includes(q) ||
          (s.department || '').toLowerCase().includes(q)
        );
      });
      const matchMsgHistory = matchInMessages(c.id, q);

      return matchName || matchDept || matchLastMsg || matchParticipant || matchMsgHistory;
    });
  }, [store.conversations, store.staff, store.messages, searchQuery]);

  const filteredDirectConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return store.conversations.filter(c => c.type === 'direct');

    return store.conversations.filter(c => {
      if (c.type !== 'direct') return false;
      const matchName = c.name.toLowerCase().includes(q);
      const matchLastMsg = (c.lastMessage || '').toLowerCase().includes(q);
      const otherParticipantId = c.participantIds.find(id => id !== store.currentUser.id);
      const otherStaff = store.staff.find(s => s.id === otherParticipantId);
      const matchStaff = otherStaff && (
        otherStaff.name.toLowerCase().includes(q) ||
        otherStaff.email.toLowerCase().includes(q) ||
        otherStaff.role.toLowerCase().includes(q) ||
        (otherStaff.department || '').toLowerCase().includes(q) ||
        (otherStaff.organisation || '').toLowerCase().includes(q)
      );
      const matchMsgHistory = matchInMessages(c.id, q);

      return matchName || matchLastMsg || matchStaff || matchMsgHistory;
    });
  }, [store.conversations, store.staff, store.messages, store.currentUser.id, searchQuery]);

  // If user searches, find all staff members to message them directly
  const filteredStaffSearchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    return store.staff.filter(s => {
      if (s.id === store.currentUser.id) return false;
      const matchName = s.name.toLowerCase().includes(q);
      const matchEmail = s.email.toLowerCase().includes(q);
      const matchRole = s.role.toLowerCase().includes(q);
      const matchDept = (s.department || '').toLowerCase().includes(q);
      const matchOrg = (s.organisation || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchRole || matchDept || matchOrg;
    });
  }, [store.staff, store.currentUser.id, searchQuery]);

  // Group participants info for active conversation
  const groupMembers = useMemo(() => {
    if (!conversation || conversation.type !== 'group') return [];
    return conversation.participantIds
      .map(id => store.staff.find(s => s.id === id))
      .filter((s): s is StaffUser => !!s);
  }, [conversation, store.staff]);

  // Direct chat partner
  const directPartner = useMemo(() => {
    if (!conversation || conversation.type !== 'direct') return null;
    const partnerId = conversation.participantIds.find(id => id !== store.currentUser.id);
    return store.staff.find(s => s.id === partnerId) || null;
  }, [conversation, store.staff, store.currentUser.id]);

  // Available staff to add to group
  const availableStaffToAdd = useMemo(() => {
    if (!conversation || conversation.type !== 'group') return [];
    return store.staff.filter(s => !conversation.participantIds.includes(s.id));
  }, [conversation, store.staff]);

  // Helper: render presence color indicator
  const getPresenceColor = (status: StaffUser['status']) => {
    switch (status) {
      case 'Online': return 'bg-[#00ad1d]';
      case 'In Teams Meeting': return 'bg-purple-600';
      case 'Busy': return 'bg-rose-500';
      case 'Away': return 'bg-amber-500';
      case 'Offline':
      default: return 'bg-slate-400';
    }
  };

  // Group presence summary
  const presenceSummary = useMemo(() => {
    const online = groupMembers.filter(m => m.status === 'Online').length;
    const inMeeting = groupMembers.filter(m => m.status === 'In Teams Meeting').length;
    const parts: string[] = [];
    if (online > 0) parts.push(`${online} Online`);
    if (inMeeting > 0) parts.push(`${inMeeting} In Teams`);
    return parts.join(' • ') || 'All offline';
  }, [groupMembers]);

  // Helper: check if attachment is image
  const isImageAttachment = (att: MessageAttachment) => {
    if (att.type === 'image') return true;
    if (att.url && att.url.startsWith('data:image/')) return true;
    if (att.mimeType && att.mimeType.startsWith('image/')) return true;
    const ext = att.name.split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext);
  };

  // Helper: get document icon
  const getDocIcon = (att: MessageAttachment) => {
    const ext = att.name.split('.').pop()?.toLowerCase() || '';
    if (isImageAttachment(att)) return <ImageIcon className="w-4 h-4 text-purple-600" />;
    if (att.type === 'pdf' || ext === 'pdf') return <FileText className="w-4 h-4 text-rose-600" />;
    if (att.type === 'xlsx' || ['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
    if (att.type === 'docx' || ['doc', 'docx'].includes(ext)) return <FileText className="w-4 h-4 text-blue-600" />;
    return <FileCode className="w-4 h-4 text-slate-600" />;
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-110px)] min-h-[580px] bg-white rounded-lg shadow-xs border border-slate-200 overflow-hidden text-xs relative">
      
      {/* ========================================================================= */}
      {/* 1. SIDEBAR: CONVERSATION LIST, SEARCH, FILTERING                          */}
      {/* ========================================================================= */}
      <div className={`w-full lg:w-84 xl:w-96 border-r border-slate-200 flex flex-col shrink-0 bg-slate-50/50 ${
        mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
      }`}>
        {/* Search Bar Header */}
        <div className="p-3 border-b border-slate-200 bg-white space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations, staff, groups, messages..."
              className="w-full pl-8.5 pr-8 py-2 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-xs text-slate-800 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ad1d]/30 focus:border-[#00ad1d] transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
              {searchQuery ? `Search Results (${filteredGroupConversations.length + filteredDirectConversations.length})` : 'Conversations'}
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingGroup(!isCreatingGroup)}
              className="px-2.5 py-1 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Group</span>
            </button>
          </div>
        </div>

        {/* Group Creation Panel */}
        {isCreatingGroup && (
          <form onSubmit={handleCreateGroup} className="p-3 bg-white border-b border-slate-200 space-y-2.5 animate-in fade-in duration-150 shadow-inner">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Create New Group Channel</span>
              </span>
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="font-semibold text-slate-700 text-[10px] block mb-1">Group Name *</label>
              <input
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Healthcare Logistics Sync"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 text-[10px] block mb-1">Department Tag (Optional)</label>
              <input
                type="text"
                value={newGroupDept}
                onChange={(e) => setNewGroupDept(e.target.value)}
                placeholder="e.g. Top management, IT, Finance, Logistics"
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 text-[10px] block mb-1">
                Select Members ({selectedStaffIds.length} chosen)
              </label>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-md p-1.5 bg-slate-50 space-y-2">
                {getStaffHierarchy(store.staff.filter(s => s.id !== store.currentUser.id)).map(orgGroup => (
                  <div key={orgGroup.organisation} className="space-y-1">
                    <div className="font-bold text-[9px] text-slate-500 uppercase tracking-wider">{orgGroup.organisation}</div>
                    {orgGroup.departments.map(deptGroup => (
                      <div key={deptGroup.department} className="pl-2 space-y-0.5 border-l border-slate-200">
                        <div className="text-[9px] font-semibold text-slate-400">{deptGroup.department}</div>
                        {deptGroup.staff.map(person => (
                          <label key={person.id} className="flex items-center gap-2 py-1 px-1.5 hover:bg-white rounded cursor-pointer transition">
                            <input
                              type="checkbox"
                              checked={selectedStaffIds.includes(person.id)}
                              onChange={(e) => {
                                setSelectedStaffIds(e.target.checked
                                  ? [...selectedStaffIds, person.id]
                                  : selectedStaffIds.filter(id => id !== person.id)
                                );
                              }}
                              className="rounded border-slate-300 text-[#00ad1d] focus:ring-[#00ad1d]"
                            />
                            <div className="min-w-0 flex-1 flex items-center justify-between">
                              <span className="font-semibold text-slate-800 truncate">{formatStaffDisplayName(person)}</span>
                              <span className="text-[9px] text-[#008f18] ml-1 shrink-0">({person.role})</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="px-3 py-1 text-slate-600 font-semibold hover:bg-slate-100 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1 bg-[#00ad1d] hover:bg-[#009218] text-white font-bold rounded shadow-2xs cursor-pointer"
              >
                Create Group
              </button>
            </div>
          </form>
        )}

        {/* Conversations Scrollable List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          
          {/* 1. Group Channels */}
          <div>
            <button
              type="button"
              onClick={() => setExpandedGroups(!expandedGroups)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:text-slate-900 rounded hover:bg-slate-100/80 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-600" />
                <span>Group Channels ({filteredGroupConversations.length})</span>
              </span>
              {expandedGroups ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {expandedGroups && (
              <div className="space-y-1 mt-1">
                {filteredGroupConversations.map(conv => {
                  const isSelected = conversation?.id === conv.id;
                  const memberCount = conv.participantIds.length;
                  return (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectConversation(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleSelectConversation(conv.id);
                        }
                      }}
                      className={`group p-2.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 border transition select-none ${
                        isSelected
                          ? 'bg-purple-50/90 border-purple-300 ring-1 ring-purple-300 text-purple-950 font-semibold shadow-xs'
                          : 'bg-white hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 font-bold text-xs border border-purple-200">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="font-bold truncate text-xs">{conv.name}</p>
                            <span className="text-[9px] text-slate-400 font-normal shrink-0 ml-1">{conv.lastMessageTime || ''}</span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {memberCount} members • {conv.lastMessage || 'No messages yet'}
                          </p>
                        </div>
                      </div>

                      {/* Delete Conversation Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConversationToDelete(conv);
                        }}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer"
                        title="Delete Group Channel"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {filteredGroupConversations.length === 0 && (
                  <p className="text-slate-400 text-[11px] italic px-2 py-1.5">No matching groups.</p>
                )}
              </div>
            )}
          </div>

          {/* 2. Direct Conversations */}
          <div className="space-y-1">
            <div className="px-2 py-1.5 text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-[#00ad1d]" />
              <span>Direct Messages ({filteredDirectConversations.length})</span>
            </div>

            {filteredDirectConversations.map(conv => {
              const isSelected = conversation?.id === conv.id;
              const partnerId = conv.participantIds.find(id => id !== store.currentUser.id);
              const partner = store.staff.find(s => s.id === partnerId);
              const presenceColor = partner ? getPresenceColor(partner.status) : 'bg-slate-400';

              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleSelectConversation(conv.id);
                    }
                  }}
                  className={`group p-2.5 rounded-lg cursor-pointer flex items-center justify-between gap-2 border transition select-none ${
                    isSelected
                      ? 'bg-emerald-50/90 border-emerald-300 ring-1 ring-emerald-300 text-emerald-950 font-semibold shadow-xs'
                      : 'bg-white hover:bg-slate-100/90 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <UserAvatar name={conv.name} avatar={partner?.avatar || conv.avatar || store.currentUser.avatar} className="w-8 h-8" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white ${presenceColor}`}></span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-bold truncate text-xs">{partner ? formatStaffDisplayName(partner) : conv.name}</p>
                        <span className="text-[9px] text-slate-400 font-normal shrink-0 ml-1">{conv.lastMessageTime || ''}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {conv.lastMessage || `${partner?.role || 'Staff'}`}
                      </p>
                    </div>
                  </div>

                  {/* Delete Conversation Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConversationToDelete(conv);
                    }}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0 cursor-pointer"
                    title="Delete Conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {filteredDirectConversations.length === 0 && !searchQuery && (
              <p className="text-slate-400 text-[11px] italic px-2 py-1.5">No direct messages yet.</p>
            )}
          </div>

          {/* 3. Search Colleagues Directory (Shown when searching to start a new chat) */}
          {searchQuery && filteredStaffSearchResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-200">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>Start Direct Chat with Colleague</span>
                <span className="text-[10px] text-slate-400">({filteredStaffSearchResults.length})</span>
              </div>

              {filteredStaffSearchResults.slice(0, 8).map(person => (
                <div
                  key={person.id}
                  onClick={() => handleStartDirectChat(person)}
                  className="p-2 rounded-lg bg-white border border-slate-200 hover:border-[#00ad1d] hover:bg-emerald-50/50 cursor-pointer flex items-center justify-between gap-2 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative shrink-0">
                      <UserAvatar name={person.name} avatar={person.avatar} className="w-7 h-7" />
                      <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white ${getPresenceColor(person.status)}`}></span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{formatStaffDisplayName(person)}</p>
                      <p className="text-[10px] text-slate-500 truncate">{person.role} • {person.department}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#008f18] font-bold shrink-0 bg-emerald-100/60 px-2 py-0.5 rounded">Message</span>
                </div>
              ))}
            </div>
          )}

          {searchQuery && filteredGroupConversations.length === 0 && filteredDirectConversations.length === 0 && filteredStaffSearchResults.length === 0 && (
            <div className="text-center py-6 text-slate-400 space-y-1">
              <Search className="w-6 h-6 mx-auto text-slate-300" />
              <p className="font-medium text-xs text-slate-600">No results found for "{searchQuery}"</p>
              <p className="text-[10px]">Try searching by group name, staff name, department, or keywords.</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN CHAT AREA (DESKTOP & MOBILE ACTIVE CONVERSATION)                  */}
      {/* ========================================================================= */}
      <div className={`flex-1 flex flex-col bg-white overflow-hidden min-w-0 ${
        mobileView === 'list' ? 'hidden lg:flex' : 'flex'
      }`}>
        {conversation ? (
          <>
            {/* TOP HEADER 1: CONVERSATION TITLE & ACTIONS */}
            <div className="py-2 px-3 sm:px-4 border-b border-slate-200 bg-white flex flex-col shrink-0 shadow-2xs">
              <div className="flex items-center justify-between gap-3">
                
                {/* Left: Mobile Back Button + Title & Info */}
                <div className="flex items-center gap-2 min-w-0">
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    title="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  {conversation.type === 'group' ? (
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200 font-bold">
                      <Users className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <UserAvatar
                        avatar={directPartner?.avatar || conversation.avatar || store.currentUser.avatar}
                        name={conversation.name}
                        className="w-8 h-8 border border-slate-200"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white ${
                          directPartner ? getPresenceColor(directPartner.status) : 'bg-[#00ad1d]'
                        }`}
                      ></span>
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-bold text-slate-900 truncate">{conversation.name}</h2>
                      {conversation.type === 'group' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          {conversation.department || 'Group Channel'}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {directPartner?.status || 'Direct Discussion'}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {conversation.type === 'group' ? (
                        <span>
                          {groupMembers.length} Members ({presenceSummary})
                        </span>
                      ) : (
                        <span>
                          {directPartner ? `${directPartner.role} • ${formatStaffDisplayOrgDept(directPartner)}` : conversation.name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Right: In-Chat Search, Members Details, Delete Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Search in this chat */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowInChatSearch(!showInChatSearch);
                      if (showInChatSearch) setInChatSearch('');
                    }}
                    className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 border transition cursor-pointer ${
                      showInChatSearch
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                    title="Search messages in this conversation"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Search</span>
                  </button>

                  {/* Add / View Group Members Action */}
                  {conversation.type === 'group' && (
                    <button
                      type="button"
                      onClick={() => setShowFullMembersModal(true)}
                      className="px-2.5 py-1.5 rounded-md font-bold text-xs flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 transition shadow-2xs cursor-pointer"
                      title="Manage group members"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-purple-700" />
                      <span className="hidden sm:inline">Manage Members</span>
                      <span className="sm:hidden">({groupMembers.length})</span>
                    </button>
                  )}

                  {/* Delete Conversation Button */}
                  <button
                    type="button"
                    onClick={() => setConversationToDelete(conversation)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                    title="Delete Conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* In-Chat Search Filter Bar */}
              {showInChatSearch && (
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-2 animate-in fade-in duration-100">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      value={inChatSearch}
                      onChange={(e) => setInChatSearch(e.target.value)}
                      placeholder={`Search in "${conversation.name}"...`}
                      className="w-full pl-8 pr-7 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600"
                    />
                    {inChatSearch && (
                      <button
                        type="button"
                        onClick={() => setInChatSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {inChatSearch && (
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">
                      {messages.length} matches
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* TOP HEADER 2: COMPACT GROUP PARTICIPANTS BAR (NO SCROLLING NEEDED)        */}
            {/* ========================================================================= */}
            {conversation.type === 'group' && (
              <div className="px-3 sm:px-4 py-1 bg-gradient-to-r from-purple-50/90 via-slate-50 to-purple-50/70 border-b border-purple-100 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1">
                      <Users className="w-3 h-3 text-purple-700" />
                      <span>Members ({groupMembers.length}):</span>
                    </span>
                  </div>

                  {/* Compact Participants Badges (viewable without horizontal scrolling) */}
                  <div className="flex items-center flex-wrap gap-1">
                    {groupMembers.map(member => {
                      const isSelf = member.id === store.currentUser.id;
                      return (
                        <div
                          key={member.id}
                          onClick={() => {
                            if (!isSelf) handleStartDirectChat(member);
                          }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 bg-white border border-purple-200/80 rounded-full shadow-2xs hover:border-purple-400 hover:bg-purple-50/50 transition ${
                            isSelf ? 'cursor-default' : 'cursor-pointer'
                          }`}
                          title={`${formatStaffDisplayName(member)} • ${member.role} (${member.status})${!isSelf ? ' — Click to message' : ''}`}
                        >
                          <div className="relative shrink-0">
                            <UserAvatar
                              avatar={member.avatar}
                              name={member.name}
                              className="w-3.5 h-3.5 border border-slate-200"
                            />
                            <span className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white ${getPresenceColor(member.status)}`} />
                          </div>
                          
                          <span className="text-[9px] font-semibold text-slate-800 truncate max-w-[80px]">
                            {member.name.split(' ')[0]}
                            {isSelf && <span className="text-purple-700 font-normal ml-0.5">(You)</span>}
                          </span>

                          {!isSelf && (
                            <MessageSquare className="w-2 h-2 text-purple-500 opacity-60" />
                          )}
                        </div>
                      );
                    })}

                    {/* Quick Add Colleague to Group Button */}
                    <button
                      type="button"
                      onClick={() => setShowFullMembersModal(true)}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-dashed border-purple-300 text-purple-700 hover:bg-purple-100/70 rounded-full text-[9px] font-bold transition cursor-pointer"
                      title="Add colleague to this group"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFullMembersModal(true)}
                  className="text-[9px] font-bold text-purple-700 hover:text-purple-900 underline shrink-0 cursor-pointer hidden sm:block"
                >
                  View All ({groupMembers.length})
                </button>
              </div>
            )}

            {/* MESSAGES THREAD */}
            <div ref={messageScrollContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 bg-slate-50/40">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 text-slate-400 space-y-2">
                  <MessageSquare className="w-9 h-9 text-slate-300" />
                  <p className="font-semibold text-slate-600">
                    {inChatSearch ? `No messages found matching "${inChatSearch}"` : 'No messages in this conversation yet.'}
                  </p>
                  <p className="text-xs max-w-sm">
                    {inChatSearch ? 'Try a different search term or clear the filter.' : 'Send a message or attach documents to collaborate with your team.'}
                  </p>
                </div>
              ) : (
                messages.map(msg => {
                  const isSelf = msg.senderId === store.currentUser.id;
                  const isSystem = msg.senderId === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="text-center my-1.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-medium border border-slate-300/50">
                          {msg.text} • {msg.timestamp}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 max-w-[90%] sm:max-w-[80%] ${isSelf ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                    >
                      <UserAvatar
                        avatar={msg.senderAvatar || store.currentUser.avatar}
                        name={msg.senderName}
                        className="w-6 h-6 border border-slate-200 shrink-0 mt-0.5"
                      />

                      <div className={`space-y-0.5 ${isSelf ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center gap-1.5 text-[10px] ${isSelf ? 'justify-end' : 'justify-start'}`}>
                          <span className="font-bold text-slate-700">{msg.senderName}</span>
                          {msg.senderRole && (
                            <span className="text-slate-400 font-normal">({msg.senderRole})</span>
                          )}
                          <span className="text-slate-400 font-normal">{msg.timestamp}</span>
                        </div>

                        <div
                          className={`p-2.5 sm:p-3 rounded-xl leading-relaxed text-xs shadow-2xs ${
                            isSelf
                              ? 'bg-purple-600 text-white rounded-tr-xs'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                          }`}
                        >
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}

                          {/* INTERACTIVE SHARED ATTACHMENTS (CLICK TO VIEW) */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`mt-1.5 space-y-1.5 pt-1.5 border-t ${
                              isSelf ? 'border-white/20' : 'border-slate-100'
                            }`}>
                              {msg.attachments.map(att => {
                                const isImg = isImageAttachment(att);
                                const tabUrl = getAttachmentTabUrl(att);

                                if (isImg) {
                                  /* Compact Image Attachment Card with Inline Thumbnail - Clicks open in new tab */
                                  return (
                                    <a
                                      key={att.id}
                                      href={tabUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="group/img relative rounded-lg overflow-hidden border border-black/10 cursor-pointer shadow-xs max-w-[280px] hover:shadow-md transition bg-slate-900 block"
                                      title="Click to open image in new tab"
                                    >
                                    {tabUrl ? (
                                      <img
                                        src={tabUrl}
                                        alt={att.name}
                                        className="w-full max-h-32 object-contain bg-slate-950/40 group-hover/img:scale-102 transition duration-200"
                                      />
                                    ) : null}
                                      
                                      {/* Image overlay banner */}
                                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-transparent flex flex-col justify-end p-1.5 opacity-90 group-hover/img:opacity-100 transition">
                                        <div className="flex items-center justify-between text-white">
                                          <div className="flex items-center gap-1 min-w-0">
                                            <ImageIcon className="w-3 h-3 text-purple-300 shrink-0" />
                                            <span className="font-semibold text-[10px] truncate max-w-[140px]">{att.name}</span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0 ml-1">
                                            <span className="text-[9px] text-white/80">{att.size}</span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                downloadAttachment(att);
                                              }}
                                              className="p-0.5 rounded hover:bg-white/20 text-white/90 hover:text-white transition cursor-pointer"
                                              title="Download image"
                                            >
                                              <Download className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] text-emerald-300 font-bold mt-0.5">
                                          <ExternalLink className="w-2.5 h-2.5" />
                                          <span>Click to Open in New Tab</span>
                                        </div>
                                      </div>
                                    </a>
                                  );
                                }

                                /* Document / PDF / Sheet Attachment Card - Clicks open in new tab */
                                return (
                                  <a
                                    key={att.id}
                                    href={tabUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`group/doc p-2 rounded-lg border flex items-center justify-between gap-2.5 cursor-pointer transition shadow-2xs select-none block no-underline max-w-[320px] ${
                                      isSelf
                                        ? 'bg-white/15 hover:bg-white/25 border-white/30 text-white'
                                        : 'bg-slate-50 hover:bg-purple-50/70 border-slate-200 hover:border-purple-300 text-slate-800'
                                    }`}
                                    title="Click to open document in new tab"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${
                                        isSelf
                                          ? 'bg-white/20 border-white/30 text-white'
                                          : 'bg-white border-slate-200 shadow-2xs'
                                      }`}>
                                        {getDocIcon(att)}
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <p className="font-bold truncate text-[11px] group-hover/doc:underline">
                                          {att.name}
                                        </p>
                                        <p className={`text-[9px] truncate ${isSelf ? 'text-white/80' : 'text-slate-500'}`}>
                                          {att.size} • Verified Document
                                        </p>
                                      </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span
                                        className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 transition shadow-2xs ${
                                          isSelf
                                            ? 'bg-white text-purple-900 group-hover/doc:bg-white/90'
                                            : 'bg-purple-600 group-hover/doc:bg-purple-700 text-white'
                                        }`}
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                        <span>Open in New Tab</span>
                                      </span>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          downloadAttachment(att);
                                        }}
                                        className={`p-1 rounded transition cursor-pointer ${
                                          isSelf
                                            ? 'text-white/80 hover:text-white hover:bg-white/20'
                                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                                        }`}
                                        title="Download File"
                                      >
                                        <Download className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ATTACHMENTS PREVIEW BAR (BEFORE SENDING) */}
            {attachments.length > 0 && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2 animate-in fade-in duration-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Ready to send ({attachments.length}):
                </span>

                {attachments.map(att => {
                  const isImg = isImageAttachment(att);
                  const tabUrl = getAttachmentTabUrl(att);
                  return (
                    <div
                      key={att.id}
                      className="p-1.5 pl-2 bg-white border border-purple-200 rounded-lg text-xs flex items-center gap-2 shadow-2xs hover:border-purple-400 transition"
                    >
                      <a
                        href={tabUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:underline cursor-pointer min-w-0"
                        title="Click to preview file in new tab before sending"
                      >
                        {isImg && tabUrl ? (
                          <img src={tabUrl} alt={att.name} className="w-5 h-5 rounded object-cover" />
                        ) : (
                          getDocIcon(att)
                        )}
                        <span className="font-medium text-slate-800 truncate max-w-[140px] text-[11px]">
                          {att.name}
                        </span>
                        <span className="text-[9px] text-slate-400">({att.size})</span>
                        <ExternalLink className="w-3 h-3 text-purple-600 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setAttachments(attachments.filter(a => a.id !== att.id));
                        }}
                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer ml-1"
                        title="Remove file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MESSAGE INPUT BAR */}
            <div className="p-2 sm:p-2.5 sm:px-3 border-t border-slate-200 bg-white shrink-0 space-y-1.5">
              <div className="flex items-end gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition cursor-pointer border border-transparent hover:border-purple-200 shrink-0 mb-0.5"
                  title="Share Document or Image (PDF, DOCX, XLSX, Photos)"
                >
                  <Paperclip className="w-4.5 h-4.5" />
                </button>

                <div className="flex-1 relative min-w-0">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={
                      conversation.type === 'group'
                        ? `Message ${conversation.name}... (Press Enter to start a new line)`
                        : `Direct message to ${directPartner ? formatStaffDisplayName(directPartner) : conversation.name}... (Press Enter for new line)`
                    }
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white text-xs text-slate-800 placeholder-slate-400 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition resize-none leading-relaxed min-h-[38px] max-h-[140px] overflow-y-auto block"
                    onKeyDown={(e) => {
                      if (enterToSend) {
                        // In "Enter to send" mode: Enter sends immediately, Shift+Enter starts a new line
                        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      } else {
                        // Default mode requested by user: Enter starts a new line!
                        // Ctrl+Enter or Cmd+Enter delivers the message
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                        // Pressing Enter alone or Shift+Enter naturally inserts newline into textarea without sending
                      }
                    }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() && attachments.length === 0}
                  className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 text-white rounded-lg shadow-2xs transition cursor-pointer shrink-0 mb-0.5"
                  title={enterToSend ? "Send Message (Enter)" : "Send Message (Ctrl+Enter)"}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Keyboard Shortcut & Enter Mode Bar */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 select-none flex-wrap gap-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-mono text-slate-600">Enter</kbd>
                    <span>{enterToSend ? 'delivers message' : 'starts a new line'}</span>
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-mono text-slate-600">
                      {enterToSend ? 'Shift+Enter' : 'Ctrl+Enter'}
                    </kbd>
                    <span>{enterToSend ? 'for new line' : 'or Send button to deliver'}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setEnterToSend(!enterToSend)}
                  className={`text-[10px] transition cursor-pointer hover:underline flex items-center gap-1 ${
                    enterToSend ? 'text-purple-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Switch between Enter inserting a new line or Enter sending the message"
                >
                  <span>Enter mode:</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    enterToSend ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {enterToSend ? 'Enter to send' : 'Enter starts new line'}
                  </span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 p-6 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">Select a Conversation</p>
            <p className="text-xs max-w-sm">Choose an existing group channel or colleague from the left, or create a new group discussion.</p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. FULL GROUP MEMBERS & DIRECTORY MODAL                                   */}
      {/* ========================================================================= */}
      {showFullMembersModal && conversation && conversation.type === 'group' && (
        <div
          className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => {
            setShowFullMembersModal(false);
            setIsAddingMember(false);
          }}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{conversation.name}</h3>
                  <p className="text-[11px] text-slate-500">Group Members Directory ({groupMembers.length} staff)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowFullMembersModal(false);
                  setIsAddingMember(false);
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Add Member Bar */}
            <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-950 text-xs">Add Colleague to this Group</span>
                {!isAddingMember && (
                  <button
                    type="button"
                    onClick={() => setIsAddingMember(true)}
                    className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Colleague</span>
                  </button>
                )}
              </div>

              {isAddingMember && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <select
                    value={selectedNewMemberId}
                    onChange={(e) => setSelectedNewMemberId(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-purple-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-600"
                  >
                    <option value="">Select colleague...</option>
                    {availableStaffToAdd.map(person => (
                      <option key={person.id} value={person.id}>
                        {formatStaffDisplayName(person)} — {person.role} ({person.department})
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddMemberToGroup}
                      disabled={!selectedNewMemberId}
                      className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] disabled:bg-slate-300 text-white rounded font-bold text-xs transition cursor-pointer"
                    >
                      Confirm Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingMember(false)}
                      className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-200 rounded font-semibold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Members List */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-72 pr-1">
              {groupMembers.map(member => {
                const isSelf = member.id === store.currentUser.id;
                return (
                  <div
                    key={member.id}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 hover:border-purple-300 hover:bg-purple-50/30 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <UserAvatar
                          avatar={member.avatar}
                          name={member.name}
                          className="w-8 h-8 border border-slate-200"
                        />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-1 ring-white ${getPresenceColor(member.status)}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{formatStaffDisplayName(member)}</span>
                          {isSelf && <span className="text-[10px] text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded font-medium">(You)</span>}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {member.role} • {formatStaffDisplayOrgDept(member)}
                        </p>
                        <p className="text-[9px] text-[#008f18] font-medium truncate">
                          Status: {member.status}
                        </p>
                      </div>
                    </div>

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowFullMembersModal(false);
                          handleStartDirectChat(member);
                        }}
                        className="px-2.5 py-1 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Message</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullMembersModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. IN-APP DELETE CONVERSATION CONFIRMATION MODAL                           */}
      {/* ========================================================================= */}
      {conversationToDelete && (
        <div
          className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setConversationToDelete(null)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <span>Delete Discussion</span>
            </div>

            <p className="text-slate-700 leading-relaxed">
              Are you sure you want to delete <strong>"{conversationToDelete.name}"</strong>?
            </p>

            <p className="text-[11px] text-slate-500 bg-rose-50/50 p-2.5 rounded border border-rose-100">
              This will remove the discussion channel and all its message history for your team.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConversationToDelete(null)}
                className="px-3.5 py-1.5 rounded-md text-slate-600 font-semibold hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteConversation}
                className="px-4 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-2xs transition cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
