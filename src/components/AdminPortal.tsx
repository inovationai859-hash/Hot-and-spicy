import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  Lock,
  Mail,
  DollarSign,
  ShoppingBag,
  Calendar,
  Users,
  LogOut,
  RefreshCw,
  Plus,
  Trash2,
  AlertCircle,
  Search,
  Eye,
  EyeOff,
  Check,
  Receipt,
  Download,
  Edit3,
  Gamepad2,
  Settings,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Printer,
  Phone,
  MapPin,
  CheckCircle2,
  Film,
  ExternalLink,
  X,
  Activity,
  Upload,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getIstDateString } from '../lib/orderNormalizer';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useCatalog } from '../context/CatalogContext';
import { resolveCatalogImage } from '../lib/catalogImages';
import { getTransformedImageUrl, type VenueImageKey } from '../lib/imageTransform';
import {
  CATALOG_CHAPTERS,
  type CatalogItem,
  type GamingRates,
  type VenueSettings,
} from '../data/catalogData';
import { scrollFocusedInputIntoView } from '../hooks/useDialogKeyboard';

const PIE_COLORS = ['#111827', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626'];

interface AdminPortalProps {
  onSwitchToCustomer: () => void;
}

interface OrderItem {
  id: string;
  userId?: string;
  customerName: string;
  phone: string;
  address: string;
  diningMode: 'dine-in' | 'takeaway';
  itemsSummary: string;
  subtotal: number;
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';
  createdAt: string;
}

interface ReservationItem {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  address: string;
  bookingType: string;
  poolDuration?: string;
  date: string;
  timeSlot: string;
  guests: number;
  status: 'Confirmed' | 'Completed' | 'Cancelled';
  createdAt: string;
}

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  is18Plus: boolean;
  authProvider: 'email' | 'phone' | 'google' | 'guest';
  createdAt: string;
  lastActivityAt: string;
  orders: OrderItem[];
  bookings: ReservationItem[];
  totalOrders: number;
  completedOrders: number;
  totalBookings: number;
  totalSpent: number;
}

interface AdminStats {
  totalRevenue: number;
  completedRevenue: number;
  pendingRevenue: number;
  todayRevenue: number;
  avgOrderValue: number;
  estimatedGamingRevenue: number;
  combinedVenueRevenue: number;
  totalOrders: number;
  pendingOrdersCount: number;
  preparingOrdersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  dineInCount: number;
  takeawayCount: number;
  activeBookings: number;
  totalBookings: number;
  totalCustomers: number;
  dailyRevenue: Array<{ date: string; label: string; revenue: number; ordersCount: number }>;
  topItems: Array<{ name: string; count: number; revenue: number }>;
}

const ORDER_STATUS_BADGE: Record<OrderItem['status'], string> = {
  Pending: 'bg-amber-50 text-amber-900 border-amber-300',
  Preparing: 'bg-sky-50 text-sky-900 border-sky-300',
  Ready: 'bg-indigo-50 text-indigo-900 border-indigo-300',
  Completed: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  Cancelled: 'bg-rose-50 text-rose-900 border-rose-300',
};

const BOOKING_STATUS_BADGE: Record<ReservationItem['status'], string> = {
  Confirmed: 'bg-sky-50 text-sky-900 border-sky-300',
  Completed: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  Cancelled: 'bg-rose-50 text-rose-900 border-rose-300',
};

interface AdminInstagramReelItem {
  id: string;
  reelUrl?: string;
  permalink?: string;
  category: string;
  caption: string;
  imageKey: VenueImageKey;
  thumbnailUrl?: string;
  mediaUrl?: string;
  duration?: string;
  isCustom?: boolean;
  timestamp?: string;
  createdAt?: string;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onSwitchToCustomer }) => {
  const {
    items: catalogItems,
    gamingRates,
    venueSettings,
    loungePerfMonitorEnabled,
    applyCatalogSnapshot,
    applyVenueSettingsSnapshot,
    refreshCatalog,
    setLoungePerfMonitorLocal,
  } = useCatalog();

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('hs_admin_token');
    } catch {
      return null;
    }
  });

  // Admin Login State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Navigation & Shared Feedback State
  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'users' | 'reservations' | 'menu' | 'settings'
  >('overview');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Core Data State
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);

  // Filters & Search
  const [orderFilter, setOrderFilter] = useState<'All' | 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled'>('All');
  const [orderSearch, setOrderSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [bookingFilter, setBookingFilter] = useState<'All' | 'dining' | 'ps5' | 'pool'>('All');
  const [bookingSearch, setBookingSearch] = useState('');
  const [menuChapterFilter, setMenuChapterFilter] = useState<string>('All');
  const [menuSearch, setMenuSearch] = useState('');

  // Inline Quick Price Edits & Item Modal State
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [failedMenuImages, setFailedMenuImages] = useState<Record<string, boolean>>({});

  // Gaming Rate Drafts & Venue Operations Drafts
  const [ratesDraft, setRatesDraft] = useState<GamingRates>(gamingRates);
  const [savingRates, setSavingRates] = useState(false);
  const [togglingPerfMonitor, setTogglingPerfMonitor] = useState(false);
  const [venueDraft, setVenueDraft] = useState<VenueSettings>(venueSettings);
  const [savingVenueSettings, setSavingVenueSettings] = useState(false);

  // Add / Edit Dish Modal
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [showDishModal, setShowDishModal] = useState(false);
  const [dishName, setDishName] = useState('');
  const [dishChapter, setDishChapter] = useState('Momos');
  const [dishPrice, setDishPrice] = useState('');
  const [dishIsVeg, setDishIsVeg] = useState(false);
  const [dishIsSpicy, setDishIsSpicy] = useState(false);
  const [dishDesc, setDishDesc] = useState('');
  const [dishImageUrl, setDishImageUrl] = useState('');
  const [uploadingDishImage, setUploadingDishImage] = useState(false);
  const [savingDishModal, setSavingDishModal] = useState(false);
  const dishFileInputRef = useRef<HTMLInputElement>(null);
  const revenueChartRef = useRef<HTMLDivElement>(null);

  // Walk-In / Counter Order Modal
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInAddress, setWalkInAddress] = useState('');
  const [walkInMode, setWalkInMode] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [walkInStatus, setWalkInStatus] = useState<'Pending' | 'Preparing' | 'Completed'>('Preparing');
  const [walkInQty, setWalkInQty] = useState<Record<string, number>>({});
  const [savingWalkIn, setSavingWalkIn] = useState(false);

  // Receipt Modal
  const [receiptOrder, setReceiptOrder] = useState<OrderItem | null>(null);

  // Password Change Form (Settings)
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  // Instagram @hotandspicy_aa Videos & Reels Manager
  const [allReels, setAllReels] = useState<AdminInstagramReelItem[]>([]);
  const [hiddenDefaultCount, setHiddenDefaultCount] = useState(0);
  const [restoringReels, setRestoringReels] = useState(false);
  const [igReelUrl, setIgReelUrl] = useState('');
  const [igCategory, setIgCategory] = useState('Tandoor Flame Reel');
  const [igDuration, setIgDuration] = useState('0:25');
  const [igImageKey, setIgImageKey] = useState<VenueImageKey>('tandoor');
  const [igCaption, setIgCaption] = useState('');
  const [igThumbnailUrl, setIgThumbnailUrl] = useState('');
  const [uploadingIgPoster, setUploadingIgPoster] = useState(false);
  const [savingIgVideo, setSavingIgVideo] = useState(false);
  const [editingReelPosterId, setEditingReelPosterId] = useState<string | null>(null);
  const [reelPosterDraft, setReelPosterDraft] = useState('');
  const [savingReelPosterId, setSavingReelPosterId] = useState<string | null>(null);
  const igPosterFileInputRef = useRef<HTMLInputElement>(null);
  const rowPosterFileInputRef = useRef<HTMLInputElement>(null);
  const rowPosterTargetIdRef = useRef<string | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 3400);
  }, []);

  useEffect(() => {
    setRatesDraft(gamingRates);
  }, [gamingRates]);

  useEffect(() => {
    setVenueDraft(venueSettings);
  }, [venueSettings]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const item of catalogItems) {
      nextDrafts[item.id] = String(item.price);
    }
    setPriceDrafts(nextDrafts);
  }, [catalogItems]);

  const clearInvalidSession = useCallback(() => {
    setAdminToken(null);
    try {
      sessionStorage.removeItem('hs_admin_token');
    } catch {}
  }, []);

  const handleAdminLogout = useCallback(() => {
    clearInvalidSession();
    onSwitchToCustomer();
  }, [clearInvalidSession, onSwitchToCustomer]);

  const fetchDashboardData = useCallback(async () => {
    if (!adminToken) return;
    setLoadingData(true);
    try {
      const headers = { Authorization: `Bearer ${adminToken}` };

      const [statsRes, ordersRes, resvRes, custRes, igVidRes] = await Promise.all([
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/orders', { headers }),
        fetch('/api/admin/reservations', { headers }),
        fetch('/api/admin/customers', { headers }),
        fetch('/api/admin/instagram-videos', { headers }),
      ]);

      if (
        statsRes.status === 401 ||
        ordersRes.status === 401 ||
        resvRes.status === 401 ||
        custRes.status === 401
      ) {
        clearInvalidSession();
        setLoginError('Session expired or invalid credentials. Please sign in.');
        return;
      }

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(oData.orders || []);
      }
      if (resvRes.ok) {
        const rData = await resvRes.json();
        setReservations(rData.reservations || []);
      }
      if (custRes.ok) {
        const cData = await custRes.json();
        setCustomers(cData.customers || []);
      }
      if (igVidRes.ok) {
        const igData = await igVidRes.json();
        setAllReels(igData.allReels || igData.videos || []);
        setHiddenDefaultCount(Number(igData.hiddenDefaultCount) || 0);
      }
      await refreshCatalog();
    } catch {
      showToast('Failed to refresh dashboard data.', 'error');
    } finally {
      setLoadingData(false);
    }
  }, [adminToken, clearInvalidSession, refreshCatalog, showToast]);

  useEffect(() => {
    if (adminToken) {
      fetchDashboardData();
    }
  }, [adminToken, fetchDashboardData]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !passwordInput) {
      setLoginError('Please enter both your admin email and password.');
      return;
    }

    setLoginLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: passwordInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      setAdminToken(data.token);
      try {
        sessionStorage.setItem('hs_admin_token', data.token);
      } catch {}
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderItem['status']) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));

        // Safely patch only mutable status fields on existing Firestore document (ISSUE-03)
        updateDoc(doc(db, 'orders', orderId), {
          status,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});

        showToast(`Order #${orderId} updated to ${status}`);
        fetchDashboardData();
      }
    } catch {
      showToast('Unable to update order status.', 'error');
    }
  };

  const handleUpdateReservationStatus = async (
    resvId: string,
    status: ReservationItem['status']
  ) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/reservations/${resvId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReservations((prev) => prev.map((r) => (r.id === resvId ? { ...r, status } : r)));
        showToast(`Booking #${resvId} marked ${status}`);
        fetchDashboardData();
      }
    } catch {
      showToast('Unable to update reservation status.', 'error');
    }
  };

  const handleQuickSavePrice = async (item: CatalogItem) => {
    if (!adminToken) return;
    const raw = priceDrafts[item.id];
    const nextPrice = Number(raw);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      showToast('Enter a valid non-negative price in ₹.', 'error');
      return;
    }

    setSavingItemId(item.id);
    try {
      const res = await fetch(`/api/admin/catalog/item/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ price: Math.round(nextPrice) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      applyCatalogSnapshot(data.items, data.gamingRates, data.venueSettings);
      showToast(`${item.name} updated to ₹${Math.round(nextPrice)} across the website.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update price.', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleToggleStock = async (item: CatalogItem) => {
    if (!adminToken) return;
    setSavingItemId(item.id);
    try {
      const res = await fetch(`/api/admin/catalog/item/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ inStock: item.inStock === false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      applyCatalogSnapshot(data.items, data.gamingRates, data.venueSettings);
      showToast(
        `${item.name} marked ${item.inStock === false ? 'In Stock' : 'Sold Out'} in Menu Book.`
      );
    } catch {
      showToast('Could not toggle stock status.', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  const openAddDishModal = () => {
    setEditingItem(null);
    setDishName('');
    setDishChapter('Momos');
    setDishPrice('');
    setDishIsVeg(false);
    setDishIsSpicy(false);
    setDishDesc('');
    setDishImageUrl('');
    if (dishFileInputRef.current) {
      dishFileInputRef.current.value = '';
    }
    setShowDishModal(true);
  };

  const openEditDishModal = (item: CatalogItem) => {
    setEditingItem(item);
    setDishName(item.name);
    setDishChapter(item.chapter);
    setDishPrice(String(item.price));
    setDishIsVeg(item.isVeg);
    setDishIsSpicy(item.isSpicy);
    setDishDesc(item.description);
    setDishImageUrl(item.imageUrl || '');
    if (dishFileInputRef.current) {
      dishFileInputRef.current.value = '';
    }
    setShowDishModal(true);
  };

  const handleDishPhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminToken) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      showToast('Only PNG, JPEG, or WebP images are supported.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      showToast('Image file must be 2.5 MB or smaller.', 'error');
      e.target.value = '';
      return;
    }

    setUploadingDishImage(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected image file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/admin/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed');

      setDishImageUrl(data.imageUrl);
      if (editingItem) {
        setFailedMenuImages((prev) => ({ ...prev, [editingItem.id]: false }));
      }
      showToast('Photo uploaded! Click Save Dish to apply it live.');
    } catch (err: any) {
      showToast(err.message || 'Could not upload dish image.', 'error');
    } finally {
      setUploadingDishImage(false);
      e.target.value = '';
    }
  };

  const handleSaveDishModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const priceNum = Number(dishPrice);
    if (!dishName.trim() || !Number.isFinite(priceNum) || priceNum <= 0) {
      showToast('Please enter a valid dish name and price.', 'error');
      return;
    }

    setSavingDishModal(true);
    try {
      const url = editingItem
        ? `/api/admin/catalog/item/${editingItem.id}`
        : '/api/admin/catalog/item';
      const method = editingItem ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: dishName.trim(),
          chapter: dishChapter,
          price: Math.round(priceNum),
          isVeg: dishIsVeg,
          isSpicy: dishIsSpicy,
          description: dishDesc.trim(),
          imageUrl: dishImageUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save dish');
      applyCatalogSnapshot(data.items, data.gamingRates, data.venueSettings);
      if (editingItem) {
        setFailedMenuImages((prev) => ({ ...prev, [editingItem.id]: false }));
      }
      setShowDishModal(false);
      showToast(editingItem ? `Updated ${dishName.trim()}` : `Added ${dishName.trim()} to Menu Book`);
    } catch (err: any) {
      showToast(err.message || 'Could not save dish.', 'error');
    } finally {
      setSavingDishModal(false);
    }
  };

  const handleDeleteDish = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/catalog/item/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      applyCatalogSnapshot(data.items, data.gamingRates, data.venueSettings);
      setConfirmDeleteId(null);
      showToast('Item removed from live Menu Book.');
    } catch (err: any) {
      showToast(err.message || 'Delete failed.', 'error');
    }
  };

  const handleSaveGamingRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setSavingRates(true);
    try {
      const res = await fetch('/api/admin/catalog/gaming', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          pool15Price: Number(ratesDraft.pool15Price),
          pool30Price: Number(ratesDraft.pool30Price),
          ps5HourlyPrice: Number(ratesDraft.ps5HourlyPrice),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save rates');
      applyCatalogSnapshot(data.items, data.gamingRates, data.venueSettings);
      showToast('Gaming Lounge rates synced across site & booking forms.');
    } catch (err: any) {
      showToast(err.message || 'Rate update failed.', 'error');
    } finally {
      setSavingRates(false);
    }
  };

  const handleSaveVenueSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || savingVenueSettings) return;
    setSavingVenueSettings(true);
    try {
      const res = await fetch('/api/admin/settings/venue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(venueDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update venue settings.');
      if (data.venueSettings) {
        applyVenueSettingsSnapshot(data.venueSettings);
      }
      showToast('Venue timings, WhatsApp, address & social links updated live.');
    } catch (err: any) {
      showToast(err.message || 'Failed to save venue settings.', 'error');
    } finally {
      setSavingVenueSettings(false);
    }
  };

  const handleTogglePerfMonitor = async () => {
    if (!adminToken || togglingPerfMonitor) return;
    const nextEnabled = !loungePerfMonitorEnabled;
    setTogglingPerfMonitor(true);
    try {
      const res = await fetch('/api/admin/settings/perf-monitor', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update monitor setting.');
      setLoungePerfMonitorLocal(Boolean(data.loungePerfMonitorEnabled));
      showToast(
        data.loungePerfMonitorEnabled
          ? '3D Gaming Lounge FPS Monitor Overlay enabled.'
          : '3D Gaming Lounge FPS Monitor Overlay hidden.'
      );
    } catch (err: any) {
      showToast(err.message || 'Could not update 3D FPS monitor setting.', 'error');
    } finally {
      setTogglingPerfMonitor(false);
    }
  };

  const handleCreateWalkInOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const selectedLines = catalogItems
      .filter((it) => (walkInQty[it.id] || 0) > 0)
      .map((it, idx) => {
        const qty = walkInQty[it.id] || 0;
        return {
          line: `${idx + 1}. ${it.name} x${qty} (${it.isVeg ? 'Veg' : 'Classic'}) - ₹${it.price * qty}`,
          total: it.price * qty,
        };
      });

    if (selectedLines.length === 0) {
      showToast('Select at least one dish to create a counter order.', 'error');
      return;
    }

    const total = selectedLines.reduce((sum, l) => sum + l.total, 0);
    const cleanDigits = walkInPhone.replace(/\D/g, '');
    const formattedPhone = cleanDigits.length >= 10 ? `+91 ${cleanDigits.slice(-10)}` : walkInPhone.trim();

    setSavingWalkIn(true);
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          customerName: walkInName.trim(),
          phone: formattedPhone,
          address: walkInAddress.trim() || (walkInMode === 'dine-in' ? 'Lounge Table' : 'Counter Pickup'),
          diningMode: walkInMode,
          itemsSummary: selectedLines.map((l) => l.line).join('\n'),
          subtotal: total,
          status: walkInStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log order');
      setShowWalkInModal(false);
      setWalkInName('');
      setWalkInPhone('');
      setWalkInAddress('');
      setWalkInQty({});
      showToast(`Counter Order #${data.order.id} (₹${total}) created.`);
      fetchDashboardData();
    } catch (err: any) {
      showToast(err.message || 'Could not log order.', 'error');
    } finally {
      setSavingWalkIn(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    if (newPwd.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    setChangingPwd(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update password');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      showToast('Administrator password updated cleanly.');
    } catch (err: any) {
      showToast(err.message || 'Password update failed.', 'error');
    } finally {
      setChangingPwd(false);
    }
  };

  const uploadAdminImageFile = async (file: File): Promise<string> => {
    if (!adminToken) throw new Error('Admin session expired.');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      throw new Error('Only PNG, JPEG, or WebP images are supported.');
    }
    if (file.size > 2.5 * 1024 * 1024) {
      throw new Error('Image file must be 2.5 MB or smaller.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read selected image file.'));
      reader.readAsDataURL(file);
    });
    const res = await fetch('/api/admin/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ dataUrl, filename: file.name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Image upload failed');
    return String(data.imageUrl || '');
  };

  const handleNewReelPosterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !adminToken) return;
    setUploadingIgPoster(true);
    try {
      const imageUrl = await uploadAdminImageFile(file);
      setIgThumbnailUrl(imageUrl);
      showToast('Reel poster photo uploaded! Click Add Reel to publish.');
    } catch (err: any) {
      showToast(err.message || 'Could not upload poster image.', 'error');
    } finally {
      setUploadingIgPoster(false);
      e.target.value = '';
    }
  };

  const handleSaveReelPoster = async (reelId: string, nextPosterUrl: string) => {
    if (!adminToken) return;
    setSavingReelPosterId(reelId);
    try {
      const res = await fetch(`/api/admin/instagram-videos/${encodeURIComponent(reelId)}/poster`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ thumbnailUrl: nextPosterUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update reel poster');
      setAllReels(data.allReels || data.videos || []);
      setHiddenDefaultCount(Number(data.hiddenDefaultCount) || 0);
      setEditingReelPosterId(null);
      setReelPosterDraft('');
      showToast(
        nextPosterUrl.trim()
          ? 'Custom reel poster saved and synced live!'
          : 'Reel poster reset to default cover theme.'
      );
    } catch (err: any) {
      showToast(err.message || 'Could not update reel poster.', 'error');
    } finally {
      setSavingReelPosterId(null);
    }
  };

  const handleExistingReelPosterFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = rowPosterTargetIdRef.current;
    e.target.value = '';
    if (!file || !targetId || !adminToken) return;
    setSavingReelPosterId(targetId);
    try {
      const uploadedUrl = await uploadAdminImageFile(file);
      await handleSaveReelPoster(targetId, uploadedUrl);
    } catch (err: any) {
      showToast(err.message || 'Could not upload reel poster.', 'error');
      setSavingReelPosterId(null);
    } finally {
      rowPosterTargetIdRef.current = null;
    }
  };

  const handleAddInstagramVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !igReelUrl.trim()) return;
    setSavingIgVideo(true);
    try {
      const res = await fetch('/api/admin/instagram-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reelUrl: igReelUrl.trim(),
          thumbnailUrl: igThumbnailUrl.trim() || undefined,
          category: igCategory.trim() || 'Featured Reel',
          duration: igDuration.trim() || '0:25',
          imageKey: igImageKey,
          caption: igCaption.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add Reel');
      setAllReels(data.allReels || data.videos || []);
      setHiddenDefaultCount(Number(data.hiddenDefaultCount) || 0);
      setIgReelUrl('');
      setIgCaption('');
      setIgThumbnailUrl('');
      if (igPosterFileInputRef.current) {
        igPosterFileInputRef.current.value = '';
      }
      showToast('Instagram Reel added to @hotandspicy_aa website carousel.');
    } catch (err: any) {
      showToast(err.message || 'Failed to add Instagram Reel.', 'error');
    } finally {
      setSavingIgVideo(false);
    }
  };

  const handleDeleteInstagramVideo = async (id: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/instagram-videos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      setAllReels(data.allReels || data.videos || []);
      setHiddenDefaultCount(Number(data.hiddenDefaultCount) || 0);
      showToast('Instagram Reel removed from website carousel.');
    } catch (err: any) {
      showToast(err.message || 'Could not delete Reel.', 'error');
    }
  };

  const handleRestoreDefaultReels = async () => {
    if (!adminToken || restoringReels) return;
    setRestoringReels(true);
    try {
      const res = await fetch('/api/admin/instagram-videos/restore-defaults', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not restore reels');
      setAllReels(data.allReels || data.videos || []);
      setHiddenDefaultCount(Number(data.hiddenDefaultCount) || 0);
      showToast('Built-in Instagram Reels restored to carousel.');
    } catch (err: any) {
      showToast(err.message || 'Could not restore built-in reels.', 'error');
    } finally {
      setRestoringReels(false);
    }
  };

  const triggerDownloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportOrdersCsv = () => {
    const header = ['Order ID', 'Customer', 'Phone', 'Address', 'Dining Mode', 'Items Ordered', 'Total Bill (INR)', 'Status', 'Created At'];
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const rows = orders.map((o) =>
      [
        o.id,
        o.customerName,
        o.phone,
        o.address,
        o.diningMode,
        o.itemsSummary.replace(/\n/g, ' | '),
        o.subtotal,
        o.status,
        o.createdAt,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownloadBlob(blob, `hot-and-spicy-orders-${getIstDateString()}.csv`);
    showToast('Orders & Revenue CSV exported.');
  };

  const handleExport7DayReportCsv = () => {
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const rowLine = (cols: Array<string | number>) => cols.map(escapeCsv).join(',');

    const todayStr = getIstDateString();
    const lines: string[] = [];

    lines.push(rowLine(['SECTION 1: OVERVIEW KPI SUMMARY']));
    lines.push(rowLine(['Metric', 'Value']));
    lines.push(rowLine(['Report Generated Date (IST)', todayStr]));
    lines.push(rowLine(['Food Revenue (INR)', stats?.totalRevenue ?? totalRevenue]));
    lines.push(rowLine(['Completed Revenue (INR)', stats?.completedRevenue ?? 0]));
    lines.push(rowLine(['Pending Pipeline Revenue (INR)', stats?.pendingRevenue ?? 0]));
    lines.push(rowLine(['Today Revenue (INR)', stats?.todayRevenue ?? 0]));
    lines.push(rowLine(['Estimated Gaming Revenue (INR)', stats?.estimatedGamingRevenue ?? 0]));
    lines.push(rowLine(['Combined Venue Revenue (INR)', stats?.combinedVenueRevenue ?? totalRevenue]));
    lines.push(rowLine(['Total Orders', stats?.totalOrders ?? orders.length]));
    lines.push(rowLine(['Average Order Value (INR)', stats?.avgOrderValue ?? 0]));
    lines.push(rowLine(['Active Gaming Slots', stats?.activeBookings ?? reservations.filter((r) => r.status === 'Confirmed').length]));
    lines.push(rowLine(['Total Registered & Guest Users', customers.length]));
    lines.push('');

    lines.push(rowLine(['SECTION 2: 7-DAY DAILY REVENUE & SALES BREAKDOWN']));
    lines.push(rowLine(['Date (IST)', 'Day Label', 'Revenue (INR)', 'Orders Count']));
    for (const day of stats?.dailyRevenue || []) {
      lines.push(rowLine([day.date, day.label, day.revenue, day.ordersCount]));
    }
    lines.push('');

    lines.push(rowLine(['SECTION 3: CUSTOMER REVENUE & ORDER SUMMARY']));
    lines.push(rowLine(['Customer ID', 'Name', 'Phone', 'Email', 'Account Type', '18+ Verified', 'Total Orders', 'Completed Orders', 'Total Bookings', 'Lifetime Spend (INR)', 'Last Activity']));
    for (const c of customers) {
      lines.push(
        rowLine([
          c.id,
          c.name,
          c.phone,
          c.email || '',
          c.authProvider,
          c.is18Plus ? 'Yes' : 'No',
          c.totalOrders,
          c.completedOrders,
          c.totalBookings,
          c.totalSpent,
          c.lastActivityAt,
        ])
      );
    }
    lines.push('');

    lines.push(rowLine(['SECTION 4: ITEMIZED ORDERS LOG']));
    lines.push(rowLine(['Order ID', 'Customer', 'Phone', 'Address', 'Dining Mode', 'Items Ordered', 'Total Bill (INR)', 'Status', 'Created At']));
    for (const o of orders) {
      lines.push(
        rowLine([
          o.id,
          o.customerName,
          o.phone,
          o.address,
          o.diningMode,
          o.itemsSummary.replace(/\n/g, ' | '),
          o.subtotal,
          o.status,
          o.createdAt,
        ])
      );
    }

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownloadBlob(blob, `hot-and-spicy-7day-revenue-report-${todayStr}.csv`);
    showToast('7-Day Revenue, Customers & Sales Report (CSV) downloaded.');
  };

  const handleDownloadRevenueGraphPng = async () => {
    const svgEl = revenueChartRef.current?.querySelector('svg');
    if (!svgEl) {
      showToast('7-Day revenue graph is not rendered yet.', 'error');
      return;
    }

    try {
      const rect = svgEl.getBoundingClientRect();
      const chartW = Math.max(640, Math.round(rect.width || 720));
      const chartH = Math.max(250, Math.round(rect.height || 260));
      const clone = svgEl.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', String(chartW));
      clone.setAttribute('height', String(chartH));
      if (!clone.getAttribute('viewBox')) {
        clone.setAttribute('viewBox', `0 0 ${chartW} ${chartH}`);
      }

      const serialized = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const loader = new Image();
        loader.onload = () => resolve(loader);
        loader.onerror = () => reject(new Error('Failed to rasterize revenue chart.'));
        loader.src = svgUrl;
      });
      URL.revokeObjectURL(svgUrl);

      const scale = 2;
      const pad = 28;
      const headerH = 68;
      const footerH = 38;
      const canvasW = chartW + pad * 2;
      const canvasH = chartH + headerH + footerH + pad;
      const canvas = document.createElement('canvas');
      canvas.width = canvasW * scale;
      canvas.height = canvasH * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      ctx.scale(scale, scale);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 20px Georgia, serif';
      ctx.fillText('Hot & Spicy — 7-Day Revenue Trends', pad, 34);

      const sevenDayTotal = (stats?.dailyRevenue || []).reduce((sum, d) => sum + d.revenue, 0);
      const sevenDayOrders = (stats?.dailyRevenue || []).reduce((sum, d) => sum + d.ordersCount, 0);
      ctx.fillStyle = '#525252';
      ctx.font = '12px sans-serif';
      ctx.fillText(
        `7-Day Food Revenue: ₹${sevenDayTotal.toLocaleString('en-IN')} · 7-Day Orders: ${sevenDayOrders} · Venue Total: ₹${(stats?.combinedVenueRevenue ?? totalRevenue).toLocaleString('en-IN')}`,
        pad,
        54
      );

      ctx.drawImage(img, pad, headerH, chartW, chartH);

      ctx.fillStyle = '#737373';
      ctx.font = '11px sans-serif';
      const todayStr = getIstDateString();
      ctx.fillText(
        `Generated ${todayStr} IST · ${venueSettings.address}`,
        pad,
        headerH + chartH + 24
      );

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG image.'))), 'image/png');
      });
      triggerDownloadBlob(pngBlob, `hot-and-spicy-7day-revenue-graph-${todayStr}.png`);
      showToast('7-Day Revenue Graph (PNG) downloaded.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to download chart PNG.', 'error');
    }
  };

  const handleExportUsersCsv = () => {
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const header = [
      'Customer ID',
      'Name',
      'Email',
      'Phone',
      'Address',
      'Account Type',
      '18+ Verified',
      'Total Orders',
      'Completed Orders',
      'Total Bookings',
      'Lifetime Spend (INR)',
      'Created At',
      'Last Activity',
    ];
    const rows = customers.map((c) =>
      [
        c.id,
        c.name,
        c.email || '',
        c.phone,
        c.address,
        c.authProvider,
        c.is18Plus ? 'Yes' : 'No',
        c.totalOrders,
        c.completedOrders,
        c.totalBookings,
        c.totalSpent,
        c.createdAt,
        c.lastActivityAt,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownloadBlob(blob, `hot-and-spicy-users-${getIstDateString()}.csv`);
    showToast(`Exported ${customers.length} user profiles to CSV.`);
  };

  // Fallback gateway when not authenticated
  if (!adminToken) {
    return (
      <div
        data-lenis-prevent
        className="min-h-screen w-full bg-white text-black flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-white border border-neutral-300 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-neutral-100 border border-neutral-300 text-black mx-auto flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="font-luxury text-2xl font-bold text-black">
              Administrator Gateway
            </h2>
            <p className="text-xs text-neutral-600">
              Authorized venue management for pricing, customer billing, orders, and revenue.
            </p>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} autoComplete="off" className="space-y-4 text-xs">
            <div>
              <label className="block text-black font-semibold mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-neutral-700" />
                <span>Admin Email *</span>
              </label>
              <input
                type="email"
                name="hs_admin_user"
                autoComplete="off"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Enter authorized admin email"
                className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[44px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="block text-black font-semibold mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-neutral-700" />
                <span>Admin Password *</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="hs_admin_pass"
                  autoComplete="current-password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter administrator password"
                  className="w-full bg-white border border-neutral-300 rounded-xl pl-3.5 pr-11 min-h-[44px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-neutral-600 hover:text-black cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full min-h-[46px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loginLoading ? 'Verifying...' : 'Unlock Admin Portal'}
            </button>
          </form>

          <div className="pt-3 border-t border-neutral-200 flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={onSwitchToCustomer}
              className="text-black font-semibold hover:text-neutral-700 underline cursor-pointer"
            >
              ← Back to Website
            </button>
            <span className="text-[11px] text-neutral-600">Protected Session</span>
          </div>
        </div>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    const matchFilter = orderFilter === 'All' || o.status === orderFilter;
    const q = orderSearch.toLowerCase();
    const matchSearch =
      !q ||
      o.customerName.toLowerCase().includes(q) ||
      o.phone.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.itemsSummary.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const filteredCustomers = customers.filter((c) => {
    const q = userSearch.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q)
    );
  });

  const filteredReservations = reservations.filter((r) => {
    const matchType = bookingFilter === 'All' || r.bookingType === bookingFilter;
    const q = bookingSearch.toLowerCase();
    const matchSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const filteredMenu = catalogItems.filter((item) => {
    const matchChap = menuChapterFilter === 'All' || item.chapter === menuChapterFilter;
    const q = menuSearch.toLowerCase();
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.chapter.toLowerCase().includes(q);
    return matchChap && matchSearch;
  });

  const totalRevenue =
    stats?.totalRevenue ??
    orders.reduce((sum, o) => (o.status !== 'Cancelled' ? sum + o.subtotal : sum), 0);

  const walkInSubtotal = catalogItems.reduce(
    (sum, it) => sum + (walkInQty[it.id] || 0) * it.price,
    0
  );

  return (
    <div
      data-lenis-prevent
      className="min-h-screen w-full bg-white text-black flex flex-col"
    >
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-[60] max-w-sm px-4 py-3 rounded-xl border shadow-2xl text-xs font-semibold flex items-center gap-2.5 ${
            toast.type === 'error'
              ? 'bg-rose-700 border-rose-800 text-white'
              : 'bg-black border-neutral-800 text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-200 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-[rgba(255,255,255,0.95)] border-b border-neutral-200 px-3 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="font-luxury text-base min-[380px]:text-lg sm:text-2xl font-bold text-black truncate">
            Hot &amp; Spicy Admin Portal
          </h1>
          <p className="hidden sm:block text-[11px] text-neutral-600 truncate">
            Pricing, Customers, Orders &amp; Venue Revenue
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchDashboardData}
            className="min-w-[40px] px-2.5 sm:px-3 min-h-[40px] rounded-xl bg-white border border-neutral-300 text-xs font-semibold text-black hover:bg-neutral-100 flex items-center justify-center gap-1.5 cursor-pointer"
            title="Refresh Live Data"
            aria-label="Refresh Live Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Sync</span>
          </button>

          <button
            type="button"
            onClick={onSwitchToCustomer}
            className="px-2.5 sm:px-3.5 min-h-[40px] rounded-xl bg-white border border-neutral-300 text-xs font-semibold text-black hover:bg-neutral-100 cursor-pointer whitespace-nowrap"
          >
            <span className="sm:hidden">Site</span>
            <span className="hidden sm:inline">Customer View</span>
          </button>

          <button
            type="button"
            onClick={handleAdminLogout}
            className="min-w-[40px] px-2.5 sm:px-3 min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl bg-black hover:bg-neutral-800 text-white text-xs font-semibold cursor-pointer"
            title="Log Out Admin"
            aria-label="Log Out Admin"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Top KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-neutral-600">
              <span className="text-xs uppercase font-bold tracking-wider">Food Revenue</span>
              <DollarSign className="w-4 h-4 text-black" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-black tabular-nums">
              ₹{totalRevenue.toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-600 tabular-nums">
              Completed: ₹{(stats?.completedRevenue || 0).toLocaleString('en-IN')} · Pipeline: ₹
              {(stats?.pendingRevenue || 0).toLocaleString('en-IN')}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-neutral-600">
              <span className="text-xs uppercase font-bold tracking-wider">Venue Total</span>
              <TrendingUp className="w-4 h-4 text-black" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-black tabular-nums">
              ₹{(stats?.combinedVenueRevenue ?? totalRevenue).toLocaleString('en-IN')}
            </div>
            <p className="text-[11px] text-neutral-600 tabular-nums">
              Includes est. ₹{(stats?.estimatedGamingRevenue || 0).toLocaleString('en-IN')} Pool &amp; PS5
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-neutral-600">
              <span className="text-xs uppercase font-bold tracking-wider">Orders &amp; AOV</span>
              <ShoppingBag className="w-4 h-4 text-black" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-black tabular-nums">
              {orders.length}{' '}
              <span className="text-sm font-semibold text-neutral-700">
                · Avg ₹{stats?.avgOrderValue || 0}
              </span>
            </div>
            <p className="text-[11px] text-neutral-600 tabular-nums">
              {orders.filter((o) => o.status === 'Pending').length} Pending ·{' '}
              {orders.filter((o) => o.status === 'Preparing').length} Preparing
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-1.5">
            <div className="flex items-center justify-between text-neutral-600">
              <span className="text-xs uppercase font-bold tracking-wider">Customers &amp; Slots</span>
              <Users className="w-4 h-4 text-black" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-black tabular-nums">
              {customers.length} Users
            </div>
            <p className="text-[11px] text-neutral-600 tabular-nums">
              {reservations.filter((r) => r.status === 'Confirmed').length} Active Slots ·{' '}
              {catalogItems.length} Live Dishes
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-neutral-200 pb-3 overflow-x-auto touch-pan-x text-xs font-bold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              ['overview', 'Overview & Revenue'],
              ['orders', `Orders & Bills (${orders.length})`],
              ['users', `Customers (${customers.length})`],
              ['reservations', `Bookings (${reservations.length})`],
              ['menu', `Prices & Menu (${catalogItems.length})`],
              ['settings', 'Settings'],
            ] as const
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-4 min-h-[40px] rounded-xl whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tabKey
                  ? 'bg-black text-white'
                  : 'text-black bg-neutral-100 hover:bg-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ============================================================
            TAB 1: OVERVIEW & REVENUE ANALYTICS
        ============================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recharts 7-Day Revenue Trends Line Chart */}
              <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-luxury text-lg sm:text-xl font-bold text-black">
                      7-Day Revenue Trends
                    </h3>
                    <p className="text-[11px] text-neutral-600">
                      Today&apos;s Revenue:{' '}
                      <strong className="text-black tabular-nums">
                        ₹{(stats?.todayRevenue || 0).toLocaleString('en-IN')}
                      </strong>{' '}
                      · Dine-In:{' '}
                      <strong className="text-black tabular-nums">{stats?.dineInCount || 0}</strong> · Takeaway:{' '}
                      <strong className="text-black tabular-nums">{stats?.takeawayCount || 0}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExport7DayReportCsv}
                      className="px-3 min-h-[36px] rounded-xl bg-black hover:bg-neutral-800 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download 7-Day Report (CSV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadRevenueGraphPng}
                      className="px-3 min-h-[36px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-black inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-black" />
                      <span>Download Graph (PNG)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportUsersCsv}
                      className="px-3 min-h-[36px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-black inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-black" />
                      <span>Download Users (CSV)</span>
                    </button>
                  </div>
                </div>

                <div ref={revenueChartRef} className="h-[250px] w-full pt-3 border-t border-neutral-200 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={stats?.dailyRevenue || []}
                      margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#525252"
                        tick={{ fill: '#171717', fontSize: 11 }}
                        axisLine={{ stroke: '#D4D4D4' }}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#525252"
                        tick={{ fill: '#171717', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => `₹${val}`}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#000000',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: '#000000',
                        }}
                        labelStyle={{ color: '#000000', fontWeight: 700 }}
                        formatter={(value: unknown, _name: unknown, item: { payload?: { ordersCount?: number } }) => [
                          `₹${Number(value || 0).toLocaleString('en-IN')} (${item?.payload?.ordersCount ?? 0} orders)`,
                          'Revenue',
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#000000"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#FFFFFF', stroke: '#000000', strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: '#000000', stroke: '#FFFFFF', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recharts Top-Selling Menu Items Pie Chart */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h3 className="font-luxury text-lg sm:text-xl font-bold text-black">
                    Top-Selling Menu Items
                  </h3>

                  {stats?.topItems && stats.topItems.length > 0 ? (
                    <>
                      <div className="h-[185px] w-full min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.topItems}
                              dataKey="revenue"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={72}
                              paddingAngle={3}
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            >
                              {stats.topItems.map((entry, idx) => (
                                <Cell
                                  key={`pie-${entry.name}`}
                                  fill={PIE_COLORS[idx % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#FFFFFF',
                                borderColor: '#000000',
                                borderRadius: '12px',
                                fontSize: '11px',
                                color: '#000000',
                              }}
                              formatter={(value: unknown, name: unknown, item: { payload?: { count?: number } }) => [
                                `₹${Number(value || 0).toLocaleString('en-IN')} · ${item?.payload?.count ?? 0} sold`,
                                String(name || ''),
                              ]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {stats.topItems.slice(0, 5).map((item, idx) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                aria-hidden="true"
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                              />
                              <span className="text-black font-medium truncate">
                                {item.name}
                              </span>
                            </div>
                            <span className="font-bold text-black tabular-nums shrink-0">
                              {item.count}x · ₹{item.revenue.toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-600">
                      Order breakdowns will appear here as kitchen orders come in.
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-neutral-200 grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('orders');
                      setShowWalkInModal(true);
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-black hover:bg-neutral-800 text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Counter Order</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('menu')}
                    className="min-h-[40px] px-3 rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-black" />
                    <span>Edit Prices</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Incoming Orders Queue */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-luxury text-xl font-bold text-black">
                  Recent Kitchen Orders &amp; Bills
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className="text-xs font-semibold text-black hover:underline cursor-pointer"
                >
                  View All Orders →
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="p-8 rounded-2xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                  <ShoppingBag className="w-8 h-8 text-neutral-500 mx-auto" />
                  <p className="text-sm font-bold text-black">No website orders yet</p>
                  <p className="text-xs text-neutral-600">
                    Live orders placed by customers on the website will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.slice(0, 4).map((order) => (
                    <div
                      key={order.id}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-black text-sm">{order.customerName}</span>
                          <span className="ml-2 text-[10px] text-neutral-600 font-mono">#{order.id}</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg font-bold text-[10px] uppercase border ${
                            ORDER_STATUS_BADGE[order.status] || ORDER_STATUS_BADGE.Pending
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-900 whitespace-pre-line bg-neutral-50 p-3 rounded-xl border border-neutral-200 font-mono">
                        {order.itemsSummary}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-neutral-600 truncate">
                          {order.phone} · <strong className="text-black">{order.address}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-black text-sm tabular-nums">
                            ₹{order.subtotal}
                          </span>
                          <button
                            type="button"
                            onClick={() => setReceiptOrder(order)}
                            className="p-1.5 rounded-lg bg-white border border-neutral-300 text-black hover:bg-neutral-100 cursor-pointer"
                            title="View Itemized Bill"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                          </button>
                          {order.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'Preparing')}
                              className="px-3 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-[11px] cursor-pointer"
                            >
                              Mark Preparing
                            </button>
                          )}
                          {order.status === 'Preparing' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'Ready')}
                              className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-[11px] cursor-pointer"
                            >
                              Mark Ready
                            </button>
                          )}
                          {order.status === 'Ready' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'Completed')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] cursor-pointer"
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 2: ORDERS & BILLS
        ============================================================ */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold overflow-x-auto">
                {(['All', 'Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setOrderFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                      orderFilter === filter
                        ? 'bg-black text-white'
                        : 'text-neutral-700 hover:text-black'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search customer, phone, dish, ID..."
                    className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowWalkInModal(true)}
                  className="px-4 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Walk-In Order</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportOrdersCsv}
                  className="px-4 min-h-[40px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-black inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-black" />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-10 rounded-2xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                <ShoppingBag className="w-8 h-8 text-neutral-500 mx-auto" />
                <p className="text-sm font-bold text-black">
                  {orders.length === 0 ? 'No website orders yet' : 'No matching orders found'}
                </p>
                <p className="text-xs text-neutral-600">
                  {orders.length === 0
                    ? 'Only real orders placed through the website appear here.'
                    : 'Try clearing the search query or switching status filter.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-black">{order.customerName}</h4>
                        <p className="text-[11px] text-neutral-600 font-mono">
                          #{order.id} · {order.diningMode === 'dine-in' ? 'Dine-In' : 'Takeaway'} ·{' '}
                          {new Date(order.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg font-bold text-[10px] uppercase border ${
                          ORDER_STATUS_BADGE[order.status] || ORDER_STATUS_BADGE.Pending
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-900 whitespace-pre-line bg-neutral-50 p-3 rounded-xl font-mono border border-neutral-200">
                      {order.itemsSummary}
                    </p>

                    <div className="text-[11px] text-neutral-600 space-y-0.5">
                      <div>
                        Address: <strong className="text-black">{order.address}</strong>
                      </div>
                      <div>
                        Phone: <strong className="text-black">{order.phone}</strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-neutral-200 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] uppercase text-neutral-500 block">Total Bill</span>
                        <span className="font-bold text-black text-base tabular-nums">
                          ₹{order.subtotal}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiptOrder(order)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-neutral-300 text-black hover:bg-neutral-100 font-semibold cursor-pointer"
                          title="Open Printable Bill Receipt"
                        >
                          <Receipt className="w-3.5 h-3.5 text-black" />
                          <span>Bill</span>
                        </button>

                        <a
                          href={`https://wa.me/${order.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Hello ${order.customerName}! Your Hot & Spicy order #${order.id} (Bill: ₹${order.subtotal}) is currently ${order.status}.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-[#25D366] text-white hover:bg-[#1EB954]"
                          title="Message Customer on WhatsApp"
                        >
                          <WhatsAppIcon className="w-4 h-4" />
                        </a>

                        <select
                          value={order.status}
                          onChange={(e) =>
                            handleUpdateOrderStatus(order.id, e.target.value as OrderItem['status'])
                          }
                          className="bg-white border border-neutral-300 text-xs text-black font-semibold rounded-lg px-2 py-1.5 cursor-pointer"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Preparing">Preparing</option>
                          <option value="Ready">Ready</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 3: CUSTOMERS & BILLING HISTORY
        ============================================================ */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-luxury text-xl font-bold text-black">
                  Customer Profiles, Ordered Items &amp; Total Bills
                </h3>
                <p className="text-xs text-neutral-600">
                  Every registered member and checkout guest with complete order &amp; billing records.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, phone, email, address..."
                    className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExportUsersCsv}
                  className="px-4 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Users Information (CSV)</span>
                </button>
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="p-10 rounded-2xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                <Users className="w-8 h-8 text-neutral-500 mx-auto" />
                <p className="text-sm font-bold text-black">
                  {customers.length === 0 ? 'No real customers yet' : 'No matching customers'}
                </p>
                <p className="text-xs text-neutral-600">
                  {customers.length === 0
                    ? 'Customers who sign up or place orders on the website will appear here.'
                    : 'Try clearing the search query.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCustomers.map((cust) => {
                  const isExpanded = expandedCustomerId === cust.id;
                  return (
                    <div
                      key={cust.id}
                      className="rounded-2xl bg-white border border-neutral-200 shadow-xs overflow-hidden text-xs"
                    >
                      <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-base text-black">{cust.name}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-neutral-100 text-black border border-neutral-300">
                              {cust.authProvider === 'guest'
                                ? 'Checkout Guest'
                                : cust.authProvider === 'phone'
                                ? 'Phone Verified'
                                : cust.authProvider === 'google'
                                ? 'Google User'
                                : 'Registered User'}
                            </span>
                            {cust.is18Plus && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                18+ Verified
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-700">
                            <span className="inline-flex items-center gap-1">
                              <Mail className="w-3 h-3 text-black" />
                              {cust.email || 'Phone-only account'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3 text-black" />
                              {cust.phone}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-black" />
                              {cust.address}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                          <div>
                            <span className="text-[10px] uppercase text-neutral-500 block">Orders</span>
                            <span className="font-bold text-sm text-black tabular-nums">
                              {cust.totalOrders}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-neutral-500 block">Bookings</span>
                            <span className="font-bold text-sm text-black tabular-nums">
                              {cust.totalBookings}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase text-neutral-500 block">
                              Lifetime Bill
                            </span>
                            <span className="font-bold text-base text-black tabular-nums">
                              ₹{cust.totalSpent.toLocaleString('en-IN')}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCustomerId(isExpanded ? null : cust.id)
                            }
                            className="px-3.5 min-h-[38px] rounded-xl bg-black hover:bg-neutral-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{isExpanded ? 'Hide History' : 'View Orders & Bills'}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-neutral-200 bg-neutral-50 p-4 sm:p-5 space-y-4">
                          <div>
                            <h4 className="font-bold text-black uppercase tracking-wider text-[11px] mb-2">
                              Itemized Orders ({cust.orders.length})
                            </h4>
                            {cust.orders.length === 0 ? (
                              <p className="text-[11px] text-neutral-600">No food orders placed yet.</p>
                            ) : (
                              <div className="space-y-2.5">
                                {cust.orders.map((ord) => (
                                  <div
                                    key={ord.id}
                                    className="p-3.5 rounded-xl bg-white border border-neutral-200 space-y-2"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="font-mono text-[11px] text-neutral-700">
                                        <strong className="text-black">#{ord.id}</strong> ·{' '}
                                        {ord.diningMode === 'dine-in' ? 'Dine-In' : 'Takeaway'} ·{' '}
                                        {new Date(ord.createdAt).toLocaleString('en-IN')}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                            ORDER_STATUS_BADGE[ord.status] || ORDER_STATUS_BADGE.Pending
                                          }`}
                                        >
                                          {ord.status}
                                        </span>
                                        <span className="font-bold text-sm text-black tabular-nums">
                                          Bill: ₹{ord.subtotal}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setReceiptOrder(ord)}
                                          className="p-1.5 rounded-lg bg-white border border-neutral-300 text-black hover:bg-neutral-100 cursor-pointer"
                                          title="Open Receipt"
                                        >
                                          <Receipt className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-[11px] text-neutral-900 whitespace-pre-line font-mono bg-neutral-50 border border-neutral-200 p-2.5 rounded-lg">
                                      {ord.itemsSummary}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {cust.bookings.length > 0 && (
                            <div>
                              <h4 className="font-bold text-black uppercase tracking-wider text-[11px] mb-2">
                                Gaming &amp; Table Bookings ({cust.bookings.length})
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {cust.bookings.map((bk) => (
                                  <div
                                    key={bk.id}
                                    className="p-3 rounded-xl bg-white border border-neutral-200 flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <div className="font-bold text-black">
                                        {bk.bookingType.toUpperCase()} · #{bk.id}
                                      </div>
                                      <div className="text-[11px] text-neutral-600">
                                        {bk.date} at {bk.timeSlot} · {bk.guests} Guests
                                      </div>
                                    </div>
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                        BOOKING_STATUS_BADGE[bk.status] || BOOKING_STATUS_BADGE.Confirmed
                                      }`}
                                    >
                                      {bk.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 4: RESERVATIONS (DINING, PS5, 8-BALL POOL)
        ============================================================ */}
        {activeTab === 'reservations' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold overflow-x-auto">
                {(
                  [
                    ['All', 'All Slots'],
                    ['dining', 'Dining Table'],
                    ['ps5', 'PS5 Arena'],
                    ['pool', '8-Ball Pool'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBookingFilter(key)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer ${
                      bookingFilter === key
                        ? 'bg-black text-white'
                        : 'text-neutral-700 hover:text-black'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  placeholder="Search guest name, phone, ID..."
                  className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {filteredReservations.length === 0 ? (
              <div className="p-10 rounded-2xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                <Calendar className="w-8 h-8 text-neutral-500 mx-auto" />
                <p className="text-sm font-bold text-black">No reservations found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {filteredReservations.map((resv) => (
                  <div
                    key={resv.id}
                    className="p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-sm text-black">
                          {resv.name} ({resv.guests} Guests)
                        </span>
                        <span className="block text-[10px] font-mono text-neutral-600 font-bold">
                          #{resv.id}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg font-bold text-[10px] uppercase border ${
                          BOOKING_STATUS_BADGE[resv.status] || BOOKING_STATUS_BADGE.Confirmed
                        }`}
                      >
                        {resv.status}
                      </span>
                    </div>

                    <div className="text-black font-semibold">
                      {resv.bookingType === 'ps5'
                        ? `PS5 Arena Slot (₹${gamingRates.ps5HourlyPrice}/hr)`
                        : resv.bookingType === 'pool'
                        ? `8-Ball Pool Table${
                            resv.poolDuration === '15min'
                              ? ` (15 Mins · ₹${gamingRates.pool15Price})`
                              : resv.poolDuration === '30min'
                              ? ` (30 Mins · ₹${gamingRates.pool30Price})`
                              : ''
                          }`
                        : 'Restaurant Dining Table'}
                    </div>

                    <div className="text-[11px] text-neutral-600 space-y-0.5">
                      <div>
                        Slot: <strong className="text-black">{resv.date} at {resv.timeSlot}</strong>
                      </div>
                      <div>Address: {resv.address}</div>
                      <div>Phone: {resv.phone}</div>
                    </div>

                    <div className="pt-2.5 border-t border-neutral-200 flex items-center justify-between gap-2">
                      <span className="text-emerald-700 font-semibold text-[11px]">
                        18+ Verified
                      </span>

                      <div className="flex items-center gap-2">
                        <a
                          href={`https://wa.me/${resv.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                            `Hello ${resv.name}! Your reservation #${resv.id} at Hot & Spicy for ${resv.date} at ${resv.timeSlot} is ${resv.status}.`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white font-bold text-[11px]"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>

                        <select
                          value={resv.status}
                          onChange={(e) =>
                            handleUpdateReservationStatus(
                              resv.id,
                              e.target.value as ReservationItem['status']
                            )
                          }
                          className="bg-white border border-neutral-300 text-xs text-black font-semibold rounded-lg px-2 py-1.5 cursor-pointer"
                        >
                          <option value="Confirmed">Confirmed</option>
                          <option value="Completed">Completed</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================
            TAB 5: MENU & LIVE PRICE EDITOR + GAMING RATES
        ============================================================ */}
        {activeTab === 'menu' && (
          <div className="space-y-6">
            {/* Gaming Lounge Rates Editor */}
            <form
              onSubmit={handleSaveGamingRates}
              className="p-5 sm:p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-neutral-100 border border-neutral-300 text-black">
                    <Gamepad2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-luxury text-lg font-bold text-black">
                      Gaming Lounge Live Pricing
                    </h3>
                    <p className="text-[11px] text-neutral-600">
                      Updates sync immediately to Gaming Lounge cards, Booking Modal, and Footer.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingRates}
                  className="px-4 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase cursor-pointer disabled:opacity-50"
                >
                  {savingRates ? 'Saving...' : 'Update Gaming Rates'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-black font-semibold mb-1">
                    8-Ball Pool · 15 Mins (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={ratesDraft.pool15Price}
                    onChange={(e) =>
                      setRatesDraft((prev) => ({ ...prev, pool15Price: Number(e.target.value) }))
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-sm font-bold text-black tabular-nums focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">
                    8-Ball Pool · 30 Mins (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={ratesDraft.pool30Price}
                    onChange={(e) =>
                      setRatesDraft((prev) => ({ ...prev, pool30Price: Number(e.target.value) }))
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-sm font-bold text-black tabular-nums focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">
                    PlayStation 5 · Per Hour (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={ratesDraft.ps5HourlyPrice}
                    onChange={(e) =>
                      setRatesDraft((prev) => ({
                        ...prev,
                        ps5HourlyPrice: Number(e.target.value),
                      }))
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-sm font-bold text-black tabular-nums focus:outline-none focus:border-black"
                  />
                </div>
              </div>
            </form>

            {/* Kitchen Menu Book Price & Stock Manager */}
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="font-luxury text-xl font-bold text-black">
                    Live Book Menu Catalog &amp; Pricing
                  </h3>
                  <p className="text-xs text-neutral-600">
                    Adjust any dish price below and press Save — customers see new prices immediately.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-3.5 pointer-events-none" />
                    <input
                      type="text"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search menu item..."
                      className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={openAddDishModal}
                    className="px-4 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Add Dish
                  </button>
                </div>
              </div>

              {/* Chapter Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
                {['All', ...CATALOG_CHAPTERS.map((c) => c.chapter)].map((chap) => (
                  <button
                    key={chap}
                    type="button"
                    onClick={() => setMenuChapterFilter(chap)}
                    className={`px-3.5 min-h-[36px] rounded-xl whitespace-nowrap cursor-pointer ${
                      menuChapterFilter === chap
                        ? 'bg-black text-white'
                        : 'bg-white border border-neutral-300 text-black hover:bg-neutral-100'
                    }`}
                  >
                    {chap}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMenu.map((item) => {
                  const draftVal = priceDrafts[item.id] ?? String(item.price);
                  const isDirty = Number(draftVal) !== item.price;
                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:p-5 rounded-2xl bg-white border border-neutral-200 shadow-xs flex flex-col justify-between space-y-3 text-xs"
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={
                            item.imageUrl && !failedMenuImages[item.id]
                              ? item.imageUrl
                              : resolveCatalogImage(item.imageKey)
                          }
                          alt={item.name}
                          onError={() =>
                            setFailedMenuImages((prev) => ({ ...prev, [item.id]: true }))
                          }
                          className="w-14 h-14 rounded-xl object-cover shrink-0 border border-neutral-200 bg-neutral-100"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-sm text-black leading-tight">
                              {item.name}
                            </h4>
                          </div>
                          <span className="text-[10px] uppercase font-bold text-neutral-600 block">
                            {item.chapter} · {item.isVeg ? 'Pure Veg' : 'Non-Veg'}
                            {item.isSpicy ? ' · Spicy' : ''}
                          </span>
                          <p className="text-[11px] text-neutral-600 line-clamp-2 leading-snug">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      {/* Inline Quick Price Update Bar */}
                      <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between gap-2">
                        <label className="text-[11px] font-semibold text-black shrink-0">
                          Price (₹):
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={draftVal}
                            onChange={(e) =>
                              setPriceDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-20 bg-white border border-neutral-300 rounded-lg px-2 py-1 text-base sm:text-xs font-bold text-black tabular-nums focus:outline-none focus:border-black"
                            aria-label={`Price for ${item.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleQuickSavePrice(item)}
                            disabled={savingItemId === item.id || !isDirty}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 ${
                              isDirty
                                ? 'bg-black hover:bg-neutral-800 text-white cursor-pointer'
                                : 'bg-neutral-200 text-neutral-500 cursor-default'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-neutral-200 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleStock(item)}
                          disabled={savingItemId === item.id}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border cursor-pointer ${
                            item.inStock !== false
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          {item.inStock !== false ? 'In Stock' : 'Sold Out'}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditDishModal(item)}
                            className="p-1.5 rounded-lg bg-white border border-neutral-300 text-black hover:bg-neutral-100 cursor-pointer"
                            title="Edit full dish details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteId === item.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteDish(item.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white font-bold text-[10px] cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded bg-neutral-200 text-black text-[10px] cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 cursor-pointer"
                              title="Delete dish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            TAB 6: ADMIN SETTINGS & PASSWORD UPDATE
        ============================================================ */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleChangePassword}
              className="p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-4 text-xs"
            >
              <div className="flex items-center gap-2.5 pb-3 border-b border-neutral-200">
                <Settings className="w-4 h-4 text-black" />
                <div>
                  <h3 className="font-luxury text-lg font-bold text-black">
                    Change Admin Password
                  </h3>
                  <p className="text-[11px] text-neutral-600">
                    Rotate administrator passcode stored encrypted on the server.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-black font-semibold mb-1">Current Password *</label>
                <input
                  type="password"
                  required
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-black font-semibold mb-1">
                  New Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-black font-semibold mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>

              <button
                type="submit"
                disabled={changingPwd}
                className="w-full min-h-[44px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {changingPwd ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>

            <div className="p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-4 text-xs">
              <div className="pb-3 border-b border-neutral-200 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-luxury text-lg font-bold text-black">
                    Venue Operations &amp; Session
                  </h3>
                  <p className="text-[11px] text-neutral-600">
                    Update hours, kitchen last order, WhatsApp counter, address, and social links live.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200 text-[10px] font-bold uppercase text-black">
                  Live Sync
                </span>
              </div>

              <form onSubmit={handleSaveVenueSettings} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-black font-semibold mb-1">Opening Time *</label>
                    <input
                      type="text"
                      required
                      value={venueDraft.openingTime}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, openingTime: e.target.value }))
                      }
                      placeholder="1:30 PM"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">Closing Time *</label>
                    <input
                      type="text"
                      required
                      value={venueDraft.closingTime}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, closingTime: e.target.value }))
                      }
                      placeholder="10:00 PM"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">Kitchen Last Order *</label>
                    <input
                      type="text"
                      required
                      value={venueDraft.kitchenLastOrder}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, kitchenLastOrder: e.target.value }))
                      }
                      placeholder="9:30 PM"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-black font-semibold mb-1">Admin WhatsApp Dispatch *</label>
                    <input
                      type="text"
                      required
                      value={venueDraft.whatsappNumber}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, whatsappNumber: e.target.value }))
                      }
                      placeholder="+91 7605857713"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">Instagram Handle *</label>
                    <input
                      type="text"
                      required
                      value={venueDraft.instagramHandle}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, instagramHandle: e.target.value }))
                      }
                      placeholder="@hotandspicy_aa"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-black font-semibold mb-1">Venue Address *</label>
                  <input
                    type="text"
                    required
                    value={venueDraft.address}
                    onChange={(e) =>
                      setVenueDraft((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="Boropara More, Dingalhat, Near Azdan Moto Hub, Bansberia, Hooghly, West Bengal – 712502"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-black font-semibold mb-1">Instagram URL</label>
                    <input
                      type="url"
                      required
                      value={venueDraft.instagramUrl}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, instagramUrl: e.target.value }))
                      }
                      className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">YouTube URL</label>
                    <input
                      type="url"
                      required
                      value={venueDraft.youtubeUrl}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, youtubeUrl: e.target.value }))
                      }
                      className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">Facebook URL</label>
                    <input
                      type="url"
                      required
                      value={venueDraft.facebookUrl}
                      onChange={(e) =>
                        setVenueDraft((prev) => ({ ...prev, facebookUrl: e.target.value }))
                      }
                      className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 min-h-[38px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingVenueSettings}
                  className="w-full min-h-[42px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {savingVenueSettings ? 'Saving Venue Details...' : 'Save Venue Details'}
                </button>
              </form>

              <div className="pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-black font-bold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-700" />
                    <span>3D Lounge FPS Monitor Overlay</span>
                  </span>
                  <p className="text-[11px] text-neutral-600">
                    Show non-intrusive live FPS, frame time &amp; draw calls in the 3D Pool preview.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={loungePerfMonitorEnabled}
                  aria-label="Toggle 3D Lounge FPS Monitor Overlay"
                  disabled={togglingPerfMonitor}
                  onClick={handleTogglePerfMonitor}
                  className={`shrink-0 px-3 min-h-[36px] rounded-xl border text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                    loungePerfMonitorEnabled
                      ? 'bg-emerald-700 border-emerald-800 text-white'
                      : 'bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200'
                  }`}
                >
                  {togglingPerfMonitor
                    ? 'Saving...'
                    : loungePerfMonitorEnabled
                    ? 'Enabled'
                    : 'Disabled'}
                </button>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex gap-2">
                <button
                  type="button"
                  onClick={onSwitchToCustomer}
                  className="flex-1 min-h-[42px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold cursor-pointer"
                >
                  Open Website
                </button>
                <button
                  type="button"
                  onClick={handleAdminLogout}
                  className="flex-1 min-h-[42px] rounded-xl bg-black hover:bg-neutral-800 text-white font-semibold cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* @hotandspicy_aa Instagram Reels & Video Manager */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-neutral-200 shadow-xs space-y-5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                <div className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 text-black" />
                  <div>
                    <h3 className="font-luxury text-lg font-bold text-black">
                      {venueSettings.instagramHandle} Instagram Videos &amp; Reels
                    </h3>
                    <p className="text-[11px] text-neutral-600">
                      Add new Reel URLs, upload custom poster covers on any Reel, or delete items from the live carousel.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hiddenDefaultCount > 0 && (
                    <button
                      type="button"
                      disabled={restoringReels}
                      onClick={handleRestoreDefaultReels}
                      className="px-3.5 min-h-[36px] rounded-xl bg-neutral-100 border border-neutral-300 hover:bg-neutral-200 text-black font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>
                        {restoringReels
                          ? 'Restoring...'
                          : `Restore Built-in Reels (${hiddenDefaultCount})`}
                      </span>
                    </button>
                  )}
                  <a
                    href={`${venueSettings.instagramUrl.replace(/\/+$/, '')}/reels/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 min-h-[36px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold inline-flex items-center gap-1.5"
                  >
                    <span>Open {venueSettings.instagramHandle} Reels</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <form onSubmit={handleAddInstagramVideo} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-black font-semibold mb-1">
                    Instagram Reel / Video URL *
                  </label>
                  <input
                    type="url"
                    required
                    value={igReelUrl}
                    onChange={(e) => setIgReelUrl(e.target.value)}
                    placeholder="https://www.instagram.com/reel/Cxyz12345/"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">Title / Category</label>
                  <input
                    type="text"
                    value={igCategory}
                    onChange={(e) => setIgCategory(e.target.value)}
                    placeholder="Tandoor Flame Reel"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-black font-semibold mb-1">Cover Theme</label>
                    <select
                      value={igImageKey}
                      onChange={(e) => setIgImageKey(e.target.value as VenueImageKey)}
                      className="w-full bg-white border border-neutral-300 rounded-xl px-2.5 min-h-[40px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                    >
                      <option value="tandoor">Tandoor</option>
                      <option value="pool">8-Ball Pool</option>
                      <option value="ps5">PS5 Arena</option>
                      <option value="momos">Momos</option>
                      <option value="frappe">Café Frappe</option>
                      <option value="pizza">Pizza</option>
                      <option value="burger">Burger</option>
                      <option value="combos">Combos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-black font-semibold mb-1">Length</label>
                    <input
                      type="text"
                      value={igDuration}
                      onChange={(e) => setIgDuration(e.target.value)}
                      placeholder="0:25"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-black font-semibold mb-1">Caption</label>
                  <input
                    type="text"
                    value={igCaption}
                    onChange={(e) => setIgCaption(e.target.value)}
                    placeholder="Sizzling charcoal tandoor & lounge moments from @hotandspicy_aa..."
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-black font-semibold mb-1">
                    Custom Reel Poster (Optional)
                  </label>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    {igThumbnailUrl && (
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-300 shrink-0">
                        <img
                          src={igThumbnailUrl}
                          alt="New reel poster preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <input
                      type="text"
                      value={igThumbnailUrl}
                      onChange={(e) => setIgThumbnailUrl(e.target.value)}
                      placeholder="Paste poster image URL or upload file..."
                      className="flex-1 min-w-0 bg-white border border-neutral-300 rounded-xl px-3.5 min-h-[40px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                    />
                    <input
                      ref={igPosterFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleNewReelPosterFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingIgPoster}
                      onClick={() => igPosterFileInputRef.current?.click()}
                      className="px-3 min-h-[40px] rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-black font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingIgPoster ? 'Uploading...' : 'Upload Poster'}</span>
                    </button>
                    {igThumbnailUrl && (
                      <button
                        type="button"
                        onClick={() => setIgThumbnailUrl('')}
                        aria-label="Clear custom reel poster"
                        className="p-2 rounded-xl border border-neutral-300 hover:bg-neutral-100 text-neutral-700 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="md:col-span-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingIgVideo || uploadingIgPoster}
                    className="w-full sm:w-auto px-6 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{savingIgVideo ? 'Adding...' : 'Add Reel'}</span>
                  </button>
                </div>
              </form>

              <input
                ref={rowPosterFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleExistingReelPosterFileChange}
                className="hidden"
              />

              <div className="pt-2 border-t border-neutral-200 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-700">
                  Live Carousel Reels &amp; Posts ({allReels.length})
                </div>
                {allReels.length === 0 ? (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-center space-y-2">
                    <p className="text-xs font-semibold text-black">
                      All reels and posts are currently removed from the carousel.
                    </p>
                    {hiddenDefaultCount > 0 && (
                      <button
                        type="button"
                        disabled={restoringReels}
                        onClick={handleRestoreDefaultReels}
                        className="px-3.5 min-h-[36px] rounded-xl bg-black hover:bg-neutral-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Built-in Reels</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allReels.map((vid) => {
                      const displayUrl =
                        vid.reelUrl || vid.permalink || venueSettings.instagramUrl;
                      const previewSrc =
                        vid.thumbnailUrl ||
                        vid.mediaUrl ||
                        getTransformedImageUrl(vid.imageKey || 'tandoor', 'thumb');
                      const isEditingPoster = editingReelPosterId === vid.id;
                      const isSavingPoster = savingReelPosterId === vid.id;
                      const hasCustomPoster = Boolean(vid.thumbnailUrl);

                      return (
                        <div
                          key={vid.id}
                          className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="w-11 h-14 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-300 shrink-0 flex items-center justify-center">
                                <img
                                  src={previewSrc}
                                  alt={vid.category}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-black truncate">
                                    {vid.category} · {vid.duration || '0:25'}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-white border border-neutral-300 text-[9px] font-bold uppercase text-neutral-700 shrink-0">
                                    {vid.isCustom ? 'Pinned Custom' : 'Built-in'}
                                  </span>
                                  {hasCustomPoster && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 text-[9px] font-bold uppercase text-emerald-800 shrink-0">
                                      Custom Poster
                                    </span>
                                  )}
                                </div>
                                <a
                                  href={displayUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-neutral-700 hover:text-black underline truncate block"
                                >
                                  {displayUrl}
                                </a>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteInstagramVideo(vid.id)}
                              aria-label={`Delete ${vid.category}`}
                              title="Remove from live carousel"
                              className="p-2 rounded-lg text-rose-700 hover:bg-rose-50 shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-neutral-200/80">
                            <button
                              type="button"
                              disabled={isSavingPoster}
                              onClick={() => {
                                rowPosterTargetIdRef.current = vid.id;
                                rowPosterFileInputRef.current?.click();
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-[11px] font-semibold text-black inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Upload className="w-3 h-3" />
                              <span>{isSavingPoster ? 'Saving...' : 'Upload Poster'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSavingPoster}
                              onClick={() => {
                                if (isEditingPoster) {
                                  setEditingReelPosterId(null);
                                  setReelPosterDraft('');
                                } else {
                                  setEditingReelPosterId(vid.id);
                                  setReelPosterDraft(vid.thumbnailUrl || '');
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-[11px] font-semibold text-black inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>{isEditingPoster ? 'Cancel URL' : 'Poster URL'}</span>
                            </button>
                            {hasCustomPoster && (
                              <button
                                type="button"
                                disabled={isSavingPoster}
                                onClick={() => handleSaveReelPoster(vid.id, '')}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-[11px] font-semibold text-neutral-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Reset Poster</span>
                              </button>
                            )}
                          </div>

                          {isEditingPoster && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={reelPosterDraft}
                                onChange={(e) => setReelPosterDraft(e.target.value)}
                                placeholder="https://... or /api/uploads/..."
                                aria-label={`Custom poster URL for ${vid.category}`}
                                className="flex-1 min-w-0 bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-base sm:text-[11px] text-black focus:outline-none focus:border-black"
                              />
                              <button
                                type="button"
                                disabled={isSavingPoster}
                                onClick={() => handleSaveReelPoster(vid.id, reelPosterDraft)}
                                className="px-3 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50 shrink-0"
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================
          MODAL: ADD / EDIT MENU DISH
      ============================================================ */}
      {showDishModal && (
        <div
          data-lenis-prevent
          onClick={() => setShowDishModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)] overscroll-none"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={scrollFocusedInputIntoView}
            className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl bg-white text-black border border-neutral-300 shadow-2xl overflow-hidden text-xs"
          >
            <div className="shrink-0 p-6 pb-3 border-b border-neutral-200 flex items-center justify-between">
              <h4 className="font-luxury text-lg font-bold text-black">
                {editingItem ? 'Edit Menu Dish' : 'Add New Menu Dish'}
              </h4>
              <button
                type="button"
                onClick={() => setShowDishModal(false)}
                className="p-1 text-neutral-600 hover:text-black cursor-pointer"
                aria-label="Close dish modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              data-dialog-scroll
              onSubmit={handleSaveDishModal}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain p-6 pt-4 space-y-3.5"
            >
              <div>
                <label className="block text-black mb-1 font-semibold">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  placeholder="e.g. Smoky Charcoal Tikka"
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-black mb-1 font-semibold">Menu Chapter</label>
                  <select
                    value={dishChapter}
                    onChange={(e) => setDishChapter(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                  >
                    {CATALOG_CHAPTERS.map((ch) => (
                      <option key={ch.chapter} value={ch.chapter}>
                        {ch.chapter} ({ch.title})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-black mb-1 font-semibold">Price (₹) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={dishPrice}
                    onChange={(e) => setDishPrice(e.target.value)}
                    placeholder="299"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="flex items-center gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dishIsVeg}
                    onChange={(e) => setDishIsVeg(e.target.checked)}
                    className="accent-black w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-black">Pure Veg</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dishIsSpicy}
                    onChange={(e) => setDishIsSpicy(e.target.checked)}
                    className="accent-black w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs text-black">Spicy Signature</span>
                </label>
              </div>

              <div>
                <label className="block text-black mb-1 font-semibold">Description</label>
                <textarea
                  rows={2}
                  value={dishDesc}
                  onChange={(e) => setDishDesc(e.target.value)}
                  placeholder="Short dish description..."
                  className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                />
              </div>

              <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-black font-semibold">Product Photo</label>
                  {dishImageUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => setDishImageUrl('')}
                      className="text-[11px] font-semibold text-neutral-700 hover:text-black underline cursor-pointer"
                    >
                      Reset Photo
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={
                      dishImageUrl.trim() ||
                      resolveCatalogImage(
                        editingItem?.imageKey ||
                          CATALOG_CHAPTERS.find((c) => c.chapter === dishChapter)
                            ?.defaultImageKey ||
                          'momos'
                      )
                    }
                    alt={dishName || 'Dish preview'}
                    onError={(e) => {
                      const fallback = resolveCatalogImage(
                        editingItem?.imageKey ||
                          CATALOG_CHAPTERS.find((c) => c.chapter === dishChapter)
                            ?.defaultImageKey ||
                          'momos'
                      );
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 border border-neutral-300 bg-white"
                  />

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      type="text"
                      value={dishImageUrl}
                      onChange={(e) => setDishImageUrl(e.target.value)}
                      placeholder="Paste https:// image URL or upload photo"
                      className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[38px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                    />
                    <input
                      ref={dishFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleDishPhotoFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploadingDishImage}
                      onClick={() => dishFileInputRef.current?.click()}
                      className="w-full min-h-[36px] px-3 rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold text-[11px] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingDishImage ? 'Uploading Photo...' : 'Upload Photo (PNG/JPEG/WebP)'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDishModal(false)}
                  className="px-4 min-h-[40px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-xs text-black font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDishModal}
                  className="px-5 min-h-[40px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold text-xs uppercase cursor-pointer disabled:opacity-50"
                >
                  {savingDishModal ? 'Saving...' : 'Save Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: CREATE WALK-IN / COUNTER ORDER
      ============================================================ */}
      {showWalkInModal && (
        <div
          data-lenis-prevent
          onClick={() => setShowWalkInModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)] overscroll-none"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={scrollFocusedInputIntoView}
            className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl bg-white text-black border border-neutral-300 shadow-2xl overflow-hidden text-xs"
          >
            <div className="shrink-0 p-5 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h4 className="font-luxury text-lg font-bold text-black">
                  Log Walk-In / Phone Order
                </h4>
                <p className="text-[11px] text-neutral-600">
                  Uses live catalog pricing and logs straight to Orders, Customer History &amp; Revenue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWalkInModal(false)}
                className="p-1 text-neutral-600 hover:text-black cursor-pointer"
                aria-label="Close counter order modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              data-dialog-scroll
              onSubmit={handleCreateWalkInOrder}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y chat-scroll-contain p-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-black font-semibold mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    placeholder="e.g. Subham Roy"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">Phone / WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    value={walkInPhone}
                    onChange={(e) => setWalkInPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-black font-semibold mb-1">Dining Mode</label>
                  <select
                    value={walkInMode}
                    onChange={(e) => setWalkInMode(e.target.value as 'dine-in' | 'takeaway')}
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                  >
                    <option value="dine-in">Dine-In / Table</option>
                    <option value="takeaway">Takeaway / Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">Table / Address</label>
                  <input
                    type="text"
                    value={walkInAddress}
                    onChange={(e) => setWalkInAddress(e.target.value)}
                    placeholder="e.g. Table 2 / Station Rd"
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black placeholder-neutral-400 focus:outline-none focus:border-black"
                  />
                </div>
                <div>
                  <label className="block text-black font-semibold mb-1">Initial Status</label>
                  <select
                    value={walkInStatus}
                    onChange={(e) =>
                      setWalkInStatus(e.target.value as 'Pending' | 'Preparing' | 'Completed')
                    }
                    className="w-full bg-white border border-neutral-300 rounded-xl px-3 min-h-[42px] text-base sm:text-xs text-black focus:outline-none focus:border-black"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Preparing">Preparing</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-black font-semibold mb-2">
                  Select Ordered Dishes
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto overscroll-contain pr-1">
                  {catalogItems.map((it) => {
                    const qty = walkInQty[it.id] || 0;
                    return (
                      <div
                        key={it.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          qty > 0
                            ? 'bg-neutral-100 border-black'
                            : 'bg-white border-neutral-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-black truncate">{it.name}</div>
                          <div className="text-[11px] text-neutral-700 tabular-nums">₹{it.price}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setWalkInQty((prev) => ({
                                ...prev,
                                [it.id]: Math.max(0, (prev[it.id] || 0) - 1),
                              }))
                            }
                            className="w-7 h-7 rounded bg-neutral-200 hover:bg-neutral-300 text-black font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <span className="w-5 text-center font-bold tabular-nums text-black">{qty}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setWalkInQty((prev) => ({
                                ...prev,
                                [it.id]: (prev[it.id] || 0) + 1,
                              }))
                            }
                            className="w-7 h-7 rounded bg-black hover:bg-neutral-800 text-white font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-neutral-600 block">Calculated Bill</span>
                  <span className="text-xl font-bold text-black tabular-nums">
                    ₹{walkInSubtotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWalkInModal(false)}
                    className="px-4 min-h-[42px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingWalkIn || walkInSubtotal <= 0}
                    className="px-5 min-h-[42px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold uppercase cursor-pointer disabled:opacity-45"
                  >
                    {savingWalkIn ? 'Logging...' : 'Create Order & Bill'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: ITEMIZED BILL / RECEIPT VIEW
      ============================================================ */}
      {receiptOrder && (
        <div
          data-lenis-prevent
          onClick={() => setReceiptOrder(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.75)] overscroll-none"
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain p-6 rounded-2xl bg-white text-black border border-neutral-300 shadow-2xl space-y-4 text-xs"
          >
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <div className="font-brand text-xl font-extrabold text-black">
                  Hot &amp; Spicy
                </div>
                <div className="text-[11px] text-neutral-600">
                  {venueSettings.address}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="p-1 text-neutral-600 hover:text-black cursor-pointer"
                aria-label="Close receipt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-neutral-600">Bill Ref:</span>
                <strong className="font-mono text-black">#{receiptOrder.id}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Date:</span>
                <span>{new Date(receiptOrder.createdAt).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Customer:</span>
                <strong>{receiptOrder.customerName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Phone:</span>
                <span>{receiptOrder.phone}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-600 shrink-0">Location / Mode:</span>
                <span className="text-right">
                  {receiptOrder.diningMode === 'dine-in' ? 'Dine-In' : 'Takeaway'} ·{' '}
                  {receiptOrder.address}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 font-mono text-[11px] whitespace-pre-line leading-relaxed text-black">
              {receiptOrder.itemsSummary}
            </div>

            <div className="pt-2 border-t border-dashed border-neutral-400 flex items-center justify-between text-base font-bold">
              <span>TOTAL BILL</span>
              <span className="tabular-nums text-black">
                ₹{receiptOrder.subtotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 min-h-[38px] rounded-xl bg-black hover:bg-neutral-800 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setReceiptOrder(null)}
                className="px-4 min-h-[38px] rounded-xl bg-white border border-neutral-300 hover:bg-neutral-100 text-black font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
