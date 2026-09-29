import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Modal,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

/* =========================================================
   ATLAS FLEET APP
   VERSION: 1.16.1 (BUILD: 27)
   ========================================================= */

const APP_VERSION = '1.16.1';
const BUILD_NUMBER = '27';
const SYNC_API_URL = 'http://192.168.1.100:3000/api/sync';

/* الألوان الأساسية للتطبيق (مطابقة لهوية التطبيق: أحمر / أبيض) */
const COLOR_PRIMARY = '#C0272D';
const COLOR_PRIMARY_DARK = '#9E1F24';
const COLOR_ACCENT = '#FF7A45';
const COLOR_SUCCESS = '#16A085';
const COLOR_INFO = '#2980B9';
const COLOR_PURPLE = '#7B61FF';
const COLOR_TEAL = '#00A8A8';
const COLOR_BG = '#F4F7FB';

/* أيقونات صغيرة وملونة لكل قسم */
const SERVICE_ICONS: Record<string, string> = {
  'وقود': '⛽',
  'زيوت': '🛢️',
  'إطارات': '🛞',
  'بطاريات': '🔋',
  'صيانة وقطع غيار': '🔧',
  'بنشر': '🛠️',
  'رحلة': '🧭'
};

const ADMIN_TAB_ICONS: Record<string, string> = {
  overview: '📊',
  requests: '📋',
  vehicles: '🚚',
  drivers: '🧑\u200d✈️',
  link: '🔗',
  coding: '🏷️',
  permissions: '🔐',
  logs: '🗂️',
  sync: '🔄'
};

const USER_TAB_ICONS: Record<string, string> = {
  my_requests: '📋',
  trips: '🧭',
  reports: '📈',
  settings: '⚙️'
};

const TAB_COLORS: Record<string, string> = {
  overview: COLOR_INFO, requests: COLOR_PRIMARY, vehicles: COLOR_SUCCESS,
  drivers: COLOR_PURPLE, link: COLOR_TEAL, coding: COLOR_ACCENT,
  permissions: '#8E44AD', logs: '#607D8B', sync: '#00A3FF',
  my_requests: COLOR_PRIMARY, trips: COLOR_INFO, reports: COLOR_SUCCESS, settings: '#6C63FF',
  'وقود': '#F39C12', 'زيوت': '#795548', 'إطارات': '#34495E', 'بطاريات': '#27AE60',
  'صيانة وقطع غيار': '#E74C3C', 'بنشر': '#9B59B6', 'رحلة': '#2980B9'
};

type Role = 'user' | 'admin';

type RequestStatus = 'قيد المراجعة' | 'مرفوض' | 'تم الاعتماد' | 'ملغي';

type RequestType =
  | 'وقود'
  | 'زيوت'
  | 'إطارات'
  | 'بطاريات'
  | 'صيانة وقطع غيار'
  | 'بنشر'
  | 'رحلة';

interface Vehicle {
  id: string;
  name: string;
  plateNumber: string;
  driverName: string;
  status: 'في الخدمة' | 'موقف';
}

interface ServiceRequest {
  id: string;
  type: RequestType;
  processNumber: string;
  date: string;
  quantity: string;
  priceAmount?: string;
  allocation: string;
  station?: string;
  fuelType?: string;
  oilType?: string;
  prevOdometer?: string;
  currentOdometer?: string;
  distanceTraveled?: string;
  hasAttachment?: boolean;
  attachmentUri?: string;
  notes?: string;
  status: RequestStatus;
  syncStatus: 'PENDING_PUSH' | 'SYNCED';
  vehicleId: string;
  vehiclePlate: string;
  driverName: string;
  // خاص بالرحلات
  tripRegion?: string;
  tripFrom?: string;
  tripTo?: string;
}

interface CodeCategories {
  spareParts: string[];
  oils: string[];
  allocations: string[];
  batteries: string[];
  stations: string[];
  tires: string[];
  fuelTypes: string[];
  maintenanceTypes: string[];
  punctureServices: string[];
  tripRegions: string[];
}

interface AuditLog {
  id: string;
  date: string;
  action: string;
  user: string;
  details: string;
}

/* =========================================================
   السائقين والربط بالسيارات (تعديل رقم 1 و2 من قائمة الطلب)
   ========================================================= */

interface DriverUser {
  id: string;
  name: string;
  username: string;
  password: string;
}

interface VehicleDriverLink {
  id: string;
  vehicleId: string;
  driverId: string;
  fromDate: string;
  toDate: string;
}

/* =========================================================
   الصلاحيات (تعديل رقم: قائمة الصلاحيات)
   ========================================================= */

interface UserPermissions {
  userId: string; // '*' = صلاحية افتراضية لكل مستخدم لم يُحدد له صلاحيات مخصصة
  canAddCodes: boolean;
  canEditCodes: boolean;
  canDeleteCodes: boolean;
  canEditPrices: boolean;
  canChangePassword: boolean;
}

const DEFAULT_PERMISSIONS: Omit<UserPermissions, 'userId'> = {
  canAddCodes: false,
  canEditCodes: false,
  canDeleteCodes: false,
  canEditPrices: false,
  canChangePassword: true
};

export default function App() {
  const APP_VERSION_DISPLAY = `v${APP_VERSION} (Build ${BUILD_NUMBER})`;

  /* =========================================================
     تسجيل الدخول
     (تعديل 1: شاشة الدخول بدون اسم أطلس ولا رقم الإصدار،
     فقط اسم المستخدم وكلمة المرور)
     ========================================================= */

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  const [currentUserRole, setCurrentUserRole] = useState<Role>('user');
  const [currentDriverId, setCurrentDriverId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<string>('my_requests');

  /* =========================================================
     تبويبات السائق
     ========================================================= */

  const [serviceSubTab, setServiceSubTab] = useState<RequestType>('وقود');

  /* =========================================================
     تبويبات المسؤول
     ========================================================= */

  const [adminSubTab, setAdminSubTab] = useState<string>('overview');
  const [adminRequestFilter, setAdminRequestFilter] = useState<RequestStatus | 'الكل'>('الكل');
  const [adminRequestTypeFilter, setAdminRequestTypeFilter] = useState<RequestType | 'الكل'>('الكل');
  const [adminSearch, setAdminSearch] = useState<string>('');
  const [adminVehicleSearch, setAdminVehicleSearch] = useState<string>('');

  /* =========================================================
     التكويدات (تعديل: نقل التكويدات إلى داخل لوحة تحكم
     المسؤول باسم "التكويدات" + إمكانية تعديل أي عنصر)
     ========================================================= */

  const [codingSubTab, setCodingSubTab] = useState<keyof CodeCategories | 'prices'>('prices');
  const [priceSubCategory, setPriceSubCategory] = useState<
    'fuel' | 'oil' | 'battery' | 'tire' | 'spare' | 'maintenance' | 'puncture'
  >('fuel');

  const [editingItemOldValue, setEditingItemOldValue] = useState<string | null>(null);
  const [editingItemNewValue, setEditingItemNewValue] = useState<string>('');
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState<string>('');
  const [newCodeInput, setNewCodeInput] = useState<string>('');
  const [priceItemSelect, setPriceItemSelect] = useState<string>('');
  const [priceValueInput, setPriceValueInput] = useState<string>('');

  /* =========================================================
     التقارير (تعديل 7: تقارير تفصيلية + تقارير إجمالية +
     تقرير خاص بالرحلات)
     ========================================================= */

  const [reportsMainTab, setReportsMainTab] = useState<'detailed' | 'summary'>('detailed');
  const [detailedCategory, setDetailedCategory] = useState<RequestType>('وقود');
  const [reportFromDate, setReportFromDate] = useState<string>('');
  const [reportToDate, setReportToDate] = useState<string>('');

  /* =========================================================
     الإعدادات للمستخدم (تعديل 7: أيقونة الإعدادات)
     ========================================================= */
  const [settingOldPass, setSettingOldPass] = useState('');
  const [settingNewPass, setSettingNewPass] = useState('');
  const [settingPlateInput, setSettingPlateInput] = useState('');
  const [settingNameInput, setSettingNameInput] = useState('');

  /* =========================================================
     المزامنة
     ========================================================= */

  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string>('لم تتم المزامنة بعد');
  const [lastSyncDate, setLastSyncDate] = useState<string>('');

  /* =========================================================
     بيانات السيارات
     ========================================================= */

  const initialVehicles: Vehicle[] = [
    { id: 'v22618', plateNumber: '22618', name: 'قاطرة فولفو 2002رقم 22618', driverName: 'عبد الغني علي دحان', status: 'في الخدمة' },
    { id: 'v36040', plateNumber: '36040', name: 'شاحنة فولفو2013 رقم 36040', driverName: 'امين الســـيد', status: 'في الخدمة' },
    { id: 'v28336', plateNumber: '28336', name: 'متسوبيشي فوزو 2012رقم 28336', driverName: 'عماد علي دحان', status: 'في الخدمة' },
    { id: 'v31538', plateNumber: '31538', name: 'ايسوزو2016 رقم 31538', driverName: 'جميل قائد', status: 'في الخدمة' },
    { id: 'v29971', plateNumber: '29971', name: 'ايسوزو 2012رقم 29971', driverName: 'يزيدعبدالواسع', status: 'في الخدمة' },
    { id: 'v34552', plateNumber: '34552', name: 'ايسوزو 2015 رقم 34552', driverName: 'حافظ النيني', status: 'في الخدمة' },
    { id: 'v33230', plateNumber: '33230', name: 'بابور اسيوزا2016 رقم  33230', driverName: 'عبده محمد ناجي', status: 'في الخدمة' },
    { id: 'v34208', plateNumber: '34208', name: 'ايسوزو2020 رقم 34208', driverName: 'فهد سعيد سيف', status: 'في الخدمة' },
    { id: 'v28807', plateNumber: '28807', name: 'دينا متسوبيشي2012 رقم 28807', driverName: 'خالد عثمان', status: 'في الخدمة' },
    { id: 'v29485', plateNumber: '29485', name: 'دينا متسوبيشي2013 رقم 29485', driverName: 'درهم علي عبده', status: 'في الخدمة' },
    { id: 'v30646', plateNumber: '30646', name: 'دينا متسوبيشي 2014رقم 30646', driverName: 'محمدالنيني', status: 'في الخدمة' },
    { id: 'v36697', plateNumber: '36697', name: 'دينا متسوبيشي2013 رقم 36697', driverName: 'حمود سرحان', status: 'في الخدمة' },
    { id: 'v24122', plateNumber: '24122', name: 'قاطره مرسديس 2005رقم 24122', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v34451', plateNumber: '34451', name: 'باص كوستر 2012', driverName: 'عدنان علي عبدالله', status: 'في الخدمة' },
    { id: 'v23317', plateNumber: '23317', name: 'دايهاتسو قلاب موديل 2004', driverName: 'محمدمحسن', status: 'في الخدمة' },
    { id: 'v28185', plateNumber: '28185', name: 'دينا متسوبيشي2010', driverName: 'سامي عبدالنور', status: 'في الخدمة' },
    { id: 'v31457', plateNumber: '31457', name: 'لاندكروزر صالون2012', driverName: 'رشاد عبدالحميد', status: 'في الخدمة' },
    { id: 'v46383', plateNumber: '46383', name: 'رافور تويوتا 2020', driverName: 'امجد لطفي عبد الحميد', status: 'في الخدمة' },
    { id: 'v29732', plateNumber: '29732', name: 'لاندكروزر صالون2011', driverName: 'عامرمحمد علي نعمان', status: 'في الخدمة' },
    { id: 'v139614', plateNumber: '139614', name: 'رافور تويوتا 2020', driverName: 'وسيم عامر محمد علي', status: 'في الخدمة' },
    { id: 'v161777', plateNumber: '161777', name: 'تويوتا رافور 2021', driverName: 'احمد لطفي عبد الحميد', status: 'في الخدمة' },
    { id: 'v53665', plateNumber: '53665', name: 'جيب2014', driverName: 'وهيب عبدالحميد', status: 'في الخدمة' },
    { id: 'v135753', plateNumber: '135753', name: 'رافور تويوتا 2014', driverName: 'حمدي شريف', status: 'في الخدمة' },
    { id: 'v27750', plateNumber: '27750', name: 'فرتشنار تويوتا 2010', driverName: 'لطفي سعيد علي', status: 'في الخدمة' },
    { id: 'v30551', plateNumber: '30551', name: 'فرتشنار تويوتا 2014', driverName: 'عبدالله الوردي', status: 'في الخدمة' },
    { id: 'v29015', plateNumber: '29015', name: 'هيلوكس غمارة 2010', driverName: 'ماجد عبده فارع', status: 'في الخدمة' },
    { id: 'v13287', plateNumber: '13287', name: 'هيلوكس غمارتين ديزل 2014', driverName: 'مروان الفقية', status: 'في الخدمة' },
    { id: 'v44972', plateNumber: '44972', name: 'سوزكي جيمني 2015', driverName: 'صابر جواد', status: 'في الخدمة' },
    { id: 'v25749', plateNumber: '25749', name: 'هيلوكس غماره  2013', driverName: 'المعرض', status: 'في الخدمة' },
    { id: 'v26519', plateNumber: '26519', name: 'هليوكس غمارتين2008', driverName: 'محمد الشيباني', status: 'في الخدمة' },
    { id: 'v20040', plateNumber: '20040', name: 'هواندي توسان2012', driverName: 'محمدالنعماني', status: 'في الخدمة' },
    { id: 'v45551', plateNumber: '45551', name: 'زوكي جمني2013', driverName: 'معاذ النيني', status: 'في الخدمة' },
    { id: 'v19404', plateNumber: '19404', name: 'باص كوستر 2004', driverName: 'سلمان احمد عبدالله', status: 'في الخدمة' },
    { id: 'v46166', plateNumber: '46166', name: 'دايهاتسو-تريوس', driverName: 'رمزي عبدالجليل', status: 'في الخدمة' },
    { id: 'v15808', plateNumber: '15808', name: 'تويوتا برادو2000', driverName: 'الخدمات', status: 'في الخدمة' },
    { id: 'v34189', plateNumber: '34189', name: 'هواندي توسان 2014', driverName: 'توحيد احمد حيدر', status: 'في الخدمة' },
    { id: 'v46379', plateNumber: '46379', name: 'فوشنار 2015', driverName: 'عبدالفتاح درهم', status: 'في الخدمة' },
    { id: 'v43166', plateNumber: '43166', name: 'دايهاتسو تريوس 2013', driverName: 'هاني فيصل', status: 'في الخدمة' },
    { id: 'v46140', plateNumber: '46140', name: 'باص كوستر  2012 جديد  بدون رقم', driverName: 'عبدالاله محمد احمد', status: 'في الخدمة' },
    { id: 'v27949', plateNumber: '27949', name: 'دايهاتسو طويل2010رقم27949', driverName: 'وحيد عبدالله سعيد', status: 'في الخدمة' },
    { id: 'v54446', plateNumber: '54446', name: 'هونداي توسان 2020', driverName: 'محمد صادق سليمان', status: 'في الخدمة' },
    { id: 'v54825', plateNumber: '54825', name: 'هونداي توسان 2020', driverName: 'اشرف عبد القادر', status: 'في الخدمة' },
    { id: 'v43661', plateNumber: '43661', name: 'دايهاتسو تريوس 2015', driverName: 'سالم باوزير', status: 'في الخدمة' },
    { id: 'v16501', plateNumber: '16501', name: 'هيلوكس غماره 2014', driverName: 'محمد سمير', status: 'في الخدمة' },
    { id: 'v43667', plateNumber: '43667', name: 'دايهاتسو تريوس2014', driverName: 'وسيم عبدالسلام', status: 'في الخدمة' },
    { id: 'v43998', plateNumber: '43998', name: 'تويوتا هيلوكس غمارتين دبل 2021', driverName: 'عبدالرقيب عبدالوهاب', status: 'في الخدمة' },
    { id: 'v49039', plateNumber: '49039', name: 'تويوتا فور تشنر 2013', driverName: 'خالدالشراعي', status: 'في الخدمة' },
    { id: 'v56989', plateNumber: '56989', name: 'تويوتا فور تشنر 2015', driverName: 'نبيل الشوافي', status: 'في الخدمة' },
    { id: 'v6', plateNumber: '6', name: 'ميثاق', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v8_1', plateNumber: '8-1', name: 'كيا برايد2009', driverName: 'سمير عبدالمولى', status: 'في الخدمة' },
    { id: 'v8_2', plateNumber: '8-2', name: 'سنتافي 2007', driverName: 'مصطفى المخلافي', status: 'في الخدمة' },
    { id: 'v8_3', plateNumber: '8-3', name: 'الرفاعة CAT المخازن الخام', driverName: 'مخازن نقيل الابل', status: 'في الخدمة' },
    { id: 'v8_4', plateNumber: '8-4', name: 'الرفاعة CAT  المخزن التام ( مرتضى )', driverName: 'المخزن التام', status: 'في الخدمة' },
    { id: 'v8_5', plateNumber: '8-5', name: 'الرفاعة CAT الانتاج', driverName: 'الانتاج', status: 'في الخدمة' },
    { id: 'v8_6', plateNumber: '8-6', name: 'الرفاعة الهندي المخازن الخام', driverName: 'المشتريات نقيل لابل', status: 'في الخدمة' },
    { id: 'v8_7', plateNumber: 'رفاعة-4', name: 'الرفاعة TCM المخازن الخام والانتاج', driverName: 'نقبل الابل', status: 'في الخدمة' },
    { id: 'v38079', plateNumber: '38079', name: 'توسان 2006', driverName: 'اروي محمد مسعد', status: 'في الخدمة' },
    { id: 'v45881', plateNumber: '45881', name: 'رافور 2006', driverName: 'بسام عبدالكريم', status: 'في الخدمة' },
    { id: 'v45880', plateNumber: '45880', name: 'رافور2011', driverName: 'صفوان قايد', status: 'في الخدمة' },
    { id: 'v36282', plateNumber: '36282', name: 'تويوتا برادو 2006', driverName: 'جميل ناجي', status: 'في الخدمة' },
    { id: 'v_riyadh', plateNumber: 'رياض', name: 'تويوتا رافور2010', driverName: 'رياض القباطي', status: 'في الخدمة' },
    { id: 'v43472', plateNumber: '43472', name: 'كيا سول', driverName: 'مدحت شريف', status: 'في الخدمة' },
    { id: 'v_verna', plateNumber: 'فيرنا', name: 'هواندي فيرنا2008', driverName: 'مراد الشوافي', status: 'في الخدمة' },
    { id: 'v31036', plateNumber: '31036', name: 'هونداي توسان2012', driverName: 'مراد المقطري', status: 'في الخدمة' },
    { id: 'v46378', plateNumber: '46378', name: 'رافور 2007', driverName: 'اديب سعيد', status: 'في الخدمة' },
    { id: 'v46062', plateNumber: '46062', name: 'هواندي توسان2005', driverName: 'سعيد محمداحمد', status: 'في الخدمة' },
    { id: 'v32631', plateNumber: '32631', name: 'رافور2007', driverName: 'انس احمد محمد', status: 'في الخدمة' },
    { id: 'v8615', plateNumber: '8615', name: 'هايلكس 1998', driverName: 'جلال شائف', status: 'في الخدمة' },
    { id: 'v135835', plateNumber: '135835', name: 'سوزوك ي سويفت ديزايز 2013', driverName: 'فرع صنعاء', status: 'في الخدمة' },
    { id: 'v122649', plateNumber: '122649', name: 'هونداي توسان 2014', driverName: 'فرع صنعاء', status: 'في الخدمة' },
    { id: 'v23230', plateNumber: '23230', name: 'هايلكس 2003', driverName: 'تلال', status: 'في الخدمة' },
    { id: 'v34991', plateNumber: '34991', name: 'هايلكس غمارتين 1998', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v24893', plateNumber: '24893', name: 'سوزوكي 1994', driverName: 'سعيد هزاع', status: 'في الخدمة' },
    { id: 'v27509', plateNumber: '27509', name: 'هيلوكس غماره 2014', driverName: 'فرع الحديدة', status: 'في الخدمة' },
    { id: 'v8204', plateNumber: '8204', name: 'هيلكس 1993', driverName: 'سعيد عبد المجيد', status: 'في الخدمة' },
    { id: 'v5787', plateNumber: '5787', name: 'كرسيدا 1993', driverName: 'وليد محمد علي', status: 'في الخدمة' },
    { id: 'v10433', plateNumber: '10433', name: 'هيلكس 1985', driverName: 'مراد عبد الله', status: 'في الخدمة' },
    { id: 'v36697_m', plateNumber: '36697-م', name: 'متسوبيشي فوزوا كانتر', driverName: 'فرع المكلا', status: 'في الخدمة' },
    { id: 'v16501_a', plateNumber: '16501-ع', name: 'هيلوكس غماره 2014', driverName: 'فرع عدن', status: 'في الخدمة' },
    { id: 'v23320', plateNumber: '23320', name: 'دايهاتسو 2004', driverName: 'جلال المقطري', status: 'في الخدمة' },
    { id: 'v46840', plateNumber: '46840', name: 'هيلكس', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v22593', plateNumber: '22593', name: 'هيلكس2002', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v4234', plateNumber: '4234', name: 'هيلكس 1990', driverName: 'غير محدد', status: 'في الخدمة' },
    { id: 'v27870', plateNumber: '27870', name: 'هيلكس غمارة 2010', driverName: 'جمال جميل (صنعاء)', status: 'في الخدمة' }
  ];

  const [allVehicles, setAllVehicles] = useState<Vehicle[]>(initialVehicles);

  /* =========================================================
     السائقون (تعديل: قائمة السائقين)
     يتم توليدها مبدئياً من أسماء السائقين في بيانات السيارات،
     ويمكن للمسؤول إدارتها لاحقاً.
     ========================================================= */

  const buildInitialDrivers = (vehicles: Vehicle[]): DriverUser[] => {
    // اسم المستخدم = رقم السيارة (اللوحة)، وكلمة المرور الافتراضية 000
    return vehicles
      .filter(v => v.driverName && v.driverName !== 'غير محدد')
      .map(v => ({
        id: `d_${v.id}`,
        name: v.driverName,
        username: v.plateNumber,
        password: '000'
      }));
  };

  const [drivers, setDrivers] = useState<DriverUser[]>(buildInitialDrivers(initialVehicles));
  const [vehicleDriverLinks, setVehicleDriverLinks] = useState<VehicleDriverLink[]>([]);

  // حقول شاشة ربط السيارات بالسائقين
  const [linkVehicleSelect, setLinkVehicleSelect] = useState<string>('');
  const [linkDriverSelect, setLinkDriverSelect] = useState<string>('');
  const [linkFromDate, setLinkFromDate] = useState<string>('');
  const [linkToDate, setLinkToDate] = useState<string>('');

  /* =========================================================
     الصلاحيات
     ========================================================= */

  const [permissions, setPermissions] = useState<UserPermissions[]>([]);
  const [permTargetUserId, setPermTargetUserId] = useState<string>('');

  const getUserPermissions = (userId: string): UserPermissions => {
    const found = permissions.find(p => p.userId === userId);
    if (found) return found;
    return { userId, ...DEFAULT_PERMISSIONS };
  };

  /* =========================================================
     التكويدات
     ========================================================= */

  const [codes, setCodes] = useState<CodeCategories>({
    spareParts: ['فلاتر', 'سير محرك', 'قماشات فرامل'],
    oils: ['زيت محرك 20W50', 'زيت هيدروليك', 'زيت جير'],
    allocations: ['رحلة تعز - عدن', 'توزيع محلي', 'حركة مصنع'],
    batteries: ['بطارية 70 أمبير', 'بطارية 100 أمبير'],
    stations: ['محطة الزبيدي', 'محطة الشركة', 'محطة الأمل'],
    tires: ['إطار 22.5', 'إطار 16'],
    fuelTypes: ['ديزل', 'بنزين ممتاز', 'بنزين عادي'],
    maintenanceTypes: ['صيانة دورية', 'صيانة كهرباء', 'صيانة ميكانيكا', 'قطع غيار'],
    punctureServices: ['تركيب إطار', 'إصلاح بنشر', 'ترصيص', 'تبديل إطار'],
    tripRegions: ['تعز', 'صنعاء', 'الحديدة', 'عدن', 'إب', 'ذمار', 'رداع']
  });

  /* =========================================================
     الأسعار
     ========================================================= */

  const [itemPrices, setItemPrices] = useState<Record<string, string>>({
    'ديزل': '1000',
    'بنزين ممتاز': '1200',
    'بنزين عادي': '1100',
    'زيت محرك 20W50': '5000',
    'زيت هيدروليك': '6000',
    'زيت جير': '7000',
    'بطارية 70 أمبير': '45000',
    'بطارية 100 أمبير': '60000',
    'إطار 22.5': '180000',
    'إطار 16': '100000'
  });

  /* =========================================================
     المستخدم الحالي
     ========================================================= */

  const [userVehicle, setUserVehicle] = useState<Vehicle>(initialVehicles[0]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [userPassword, setUserPassword] = useState('000');
  const [adminUsername] = useState('ميثاق');
  const [adminPassword, setAdminPassword] = useState('000');

  /* =========================================================
     حقول طلب السائق
     ========================================================= */

  const [reqProcessNo, setReqProcessNo] = useState('');
  const [reqQuantity, setReqQuantity] = useState('');
  const [reqPriceAmount, setReqPriceAmount] = useState('');
  const [reqAllocation, setReqAllocation] = useState('');
  const [reqStation, setReqStation] = useState('');
  const [reqFuelType, setReqFuelType] = useState('');
  const [reqOilType, setReqOilType] = useState('');
  const [reqPrevOdometer, setReqPrevOdometer] = useState('0');
  const [reqCurrentOdometer, setReqCurrentOdometer] = useState('');
  const [reqDistanceTraveled, setReqDistanceTraveled] = useState('0');
  const [reqAttachmentUri, setReqAttachmentUri] = useState<string | null>(null);
  const [reqNotes, setReqNotes] = useState('');
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);

  // حقول طلب الرحلة (تعديل 8)
  const [tripRegion, setTripRegion] = useState('');
  const [tripFrom, setTripFrom] = useState('');
  const [tripTo, setTripTo] = useState('');
  const [tripNotes, setTripNotes] = useState('');

  /* =========================================================
     تحميل / حفظ البيانات محلياً
     ========================================================= */

  useEffect(() => {
    loadLocalData();
  }, []);

  const loadLocalData = async () => {
    try {
      const savedRequests = await AsyncStorage.getItem('@fleet_requests');
      const savedVehicles = await AsyncStorage.getItem('@all_vehicles');
      const savedCodes = await AsyncStorage.getItem('@fleet_codes');
      const savedPrices = await AsyncStorage.getItem('@item_prices');
      const savedLogs = await AsyncStorage.getItem('@fleet_audit_logs');
      const savedLastSync = await AsyncStorage.getItem('@fleet_last_sync');
      const savedAdminPassword = await AsyncStorage.getItem('@fleet_admin_password');
      const savedDrivers = await AsyncStorage.getItem('@fleet_drivers');
      const savedLinks = await AsyncStorage.getItem('@fleet_vehicle_driver_links');
      const savedPermissions = await AsyncStorage.getItem('@fleet_permissions');

      if (savedRequests) setRequests(JSON.parse(savedRequests));
      if (savedVehicles) setAllVehicles(JSON.parse(savedVehicles));
      if (savedCodes) setCodes(JSON.parse(savedCodes));
      if (savedPrices) setItemPrices(JSON.parse(savedPrices));
      if (savedLogs) setAuditLogs(JSON.parse(savedLogs));
      if (savedLastSync) setLastSyncDate(savedLastSync);
      if (savedAdminPassword) setAdminPassword(savedAdminPassword);
      if (savedDrivers) setDrivers(JSON.parse(savedDrivers));
      if (savedLinks) setVehicleDriverLinks(JSON.parse(savedLinks));
      if (savedPermissions) setPermissions(JSON.parse(savedPermissions));
    } catch (e) {
      console.log('خطأ قراءة البيانات', e);
    }
  };

  const saveRequestsLocally = async (newList: ServiceRequest[]) => {
    setRequests(newList);
    await AsyncStorage.setItem('@fleet_requests', JSON.stringify(newList));
  };

  const saveVehiclesLocally = async (newList: Vehicle[]) => {
    setAllVehicles(newList);
    await AsyncStorage.setItem('@all_vehicles', JSON.stringify(newList));
  };

  const saveCodesLocally = async (newCodes: CodeCategories) => {
    setCodes(newCodes);
    await AsyncStorage.setItem('@fleet_codes', JSON.stringify(newCodes));
  };

  const savePricesLocally = async (newPrices: Record<string, string>) => {
    setItemPrices(newPrices);
    await AsyncStorage.setItem('@item_prices', JSON.stringify(newPrices));
  };

  const saveDriversLocally = async (newList: DriverUser[]) => {
    setDrivers(newList);
    await AsyncStorage.setItem('@fleet_drivers', JSON.stringify(newList));
  };

  const saveLinksLocally = async (newList: VehicleDriverLink[]) => {
    setVehicleDriverLinks(newList);
    await AsyncStorage.setItem('@fleet_vehicle_driver_links', JSON.stringify(newList));
  };

  const savePermissionsLocally = async (newList: UserPermissions[]) => {
    setPermissions(newList);
    await AsyncStorage.setItem('@fleet_permissions', JSON.stringify(newList));
  };

  const addAuditLog = async (action: string, details: string) => {
    const newLog: AuditLog = {
      id: `LOG-${Date.now()}`,
      date: new Date().toLocaleString('ar-YE'),
      action,
      user: currentUserRole === 'admin' ? 'المسؤول' : userVehicle.driverName,
      details
    };
    const updated = [newLog, ...auditLogs];
    setAuditLogs(updated);
    await AsyncStorage.setItem('@fleet_audit_logs', JSON.stringify(updated));
  };

  /* =========================================================
     تسجيل الدخول (تعديل 1)
     ========================================================= */

  const handleLogin = () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    if (loginUsername.trim() === adminUsername && loginPassword === adminPassword) {
      setCurrentUserRole('admin');
      setIsLoggedIn(true);
      setCurrentTab('overview');
      return;
    }

    const driver = drivers.find(d => d.username === loginUsername.trim());
    if (driver && driver.password === loginPassword) {
      setCurrentUserRole('user');
      setCurrentDriverId(driver.id);

      // تحديد السيارة المرتبطة حالياً بهذا السائق (إن وجدت)
      const activeLink = vehicleDriverLinks.find(l => l.driverId === driver.id);
      const linkedVehicle = activeLink
        ? allVehicles.find(v => v.id === activeLink.vehicleId)
        : allVehicles.find(v => v.driverName === driver.name);

      setUserVehicle(linkedVehicle || allVehicles[0]);
      setIsLoggedIn(true);
      setCurrentTab('my_requests');
      return;
    }

    Alert.alert('خطأ', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginUsername('');
    setLoginPassword('');
    setCurrentDriverId('');
  };

  /* =========================================================
     تعبئة العداد السابق تلقائياً للزيوت (تعديل 5)
     ========================================================= */
  useEffect(() => {
    if (serviceSubTab === 'زيوت') {
      const oilReqs = requests.filter(r => r.vehicleId === userVehicle.id && r.type === 'زيوت');
      if (oilReqs.length > 0) {
        const lastOilReq = oilReqs[0]; // أحدث طلب
        if (lastOilReq.currentOdometer) {
          setReqPrevOdometer(lastOilReq.currentOdometer);
        }
      }
    }
  }, [serviceSubTab, requests, userVehicle]);

  /* =========================================================
     حساب السعر التلقائي عند إدخال الكمية (تعديل 3)
     ========================================================= */
  const getSelectedItemForPrice = (): string => {
    if (serviceSubTab === 'وقود') return reqFuelType;
    if (serviceSubTab === 'زيوت') return reqOilType;
    if (serviceSubTab === 'إطارات') return reqAllocation; // اسم الإطار المختار يوضع في reqAllocation في شاشة الإطارات
    if (serviceSubTab === 'بطاريات') return reqAllocation; // اسم البطارية المختارة
    return '';
  };

  const handleQuantityChange = (val: string) => {
    setReqQuantity(val);
    const qty = parseFloat(val);
    const selectedItem = getSelectedItemForPrice();
    if (!isNaN(qty) && selectedItem && itemPrices[selectedItem]) {
      const unitPrice = parseFloat(itemPrices[selectedItem]);
      if (!isNaN(unitPrice)) {
        setReqPriceAmount(String(qty * unitPrice));
        return;
      }
    }
    setReqPriceAmount('');
  };

  // إعادة حساب السعر عند تغيير الصنف بعد إدخال الكمية مسبقاً
  useEffect(() => {
    if (reqQuantity) {
      handleQuantityChange(reqQuantity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqFuelType, reqOilType]);

  /* =========================================================
     العداد الحالي / المسافة المقطوعة
     ========================================================= */
  useEffect(() => {
    const prev = parseFloat(reqPrevOdometer);
    const curr = parseFloat(reqCurrentOdometer);
    if (!isNaN(prev) && !isNaN(curr) && curr >= prev) {
      setReqDistanceTraveled(String(curr - prev));
    } else {
      setReqDistanceTraveled('0');
    }
  }, [reqPrevOdometer, reqCurrentOdometer]);

  /* =========================================================
     إرفاق صورة: كاميرا أو معرض (تعديل 4)
     ========================================================= */

  const openAttachmentOptions = () => {
    setAttachmentModalVisible(true);
  };

  const pickFromCamera = async () => {
    setAttachmentModalVisible(false);
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('تنبيه', 'يجب السماح باستخدام الكاميرا');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: false
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReqAttachmentUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    setAttachmentModalVisible(false);
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('تنبيه', 'يجب السماح بالوصول إلى معرض الصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsEditing: false
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setReqAttachmentUri(result.assets[0].uri);
    }
  };

  /* =========================================================
     إرسال طلب خدمة (غير رحلة)
     ========================================================= */

  const resetRequestFields = () => {
    setReqProcessNo('');
    setReqQuantity('');
    setReqPriceAmount('');
    setReqAllocation('');
    setReqStation('');
    setReqFuelType('');
    setReqOilType('');
    setReqCurrentOdometer('');
    setReqDistanceTraveled('0');
    setReqAttachmentUri(null);
    setReqNotes('');
  };

  const handleSubmitRequest = async () => {
    if (!reqProcessNo.trim() || !reqQuantity.trim()) {
      Alert.alert('تنبيه', 'الرجاء تعبئة رقم العملية والكمية على الأقل');
      return;
    }

    const newRequest: ServiceRequest = {
      id: `REQ-${Date.now()}`,
      type: serviceSubTab,
      processNumber: reqProcessNo,
      date: new Date().toLocaleString('ar-YE'),
      quantity: reqQuantity,
      priceAmount: reqPriceAmount,
      allocation: reqAllocation,
      station: reqStation,
      fuelType: reqFuelType,
      oilType: reqOilType,
      prevOdometer: reqPrevOdometer,
      currentOdometer: reqCurrentOdometer,
      distanceTraveled: reqDistanceTraveled,
      hasAttachment: !!reqAttachmentUri,
      attachmentUri: reqAttachmentUri || undefined,
      notes: reqNotes,
      status: 'قيد المراجعة',
      syncStatus: 'PENDING_PUSH',
      vehicleId: userVehicle.id,
      vehiclePlate: userVehicle.plateNumber,
      driverName: userVehicle.driverName
    };

    const updated = [newRequest, ...requests];
    await saveRequestsLocally(updated);
    await addAuditLog('إضافة طلب', `طلب ${serviceSubTab} للسيارة ${userVehicle.plateNumber}`);
    resetRequestFields();
    Alert.alert('تم', 'تم إرسال الطلب بنجاح، بانتظار مراجعة المسؤول');
  };

  const handleSubmitTrip = async () => {
    if (!tripRegion.trim() || !tripFrom.trim() || !tripTo.trim()) {
      Alert.alert('تنبيه', 'الرجاء تحديد المنطقة وتاريخ البداية والنهاية للرحلة');
      return;
    }
    const newRequest: ServiceRequest = {
      id: `TRIP-${Date.now()}`,
      type: 'رحلة',
      processNumber: `TRIP-${Date.now()}`,
      date: new Date().toLocaleString('ar-YE'),
      quantity: '1',
      allocation: tripRegion,
      notes: tripNotes,
      status: 'قيد المراجعة',
      syncStatus: 'PENDING_PUSH',
      vehicleId: userVehicle.id,
      vehiclePlate: userVehicle.plateNumber,
      driverName: userVehicle.driverName,
      tripRegion,
      tripFrom,
      tripTo
    };
    const updated = [newRequest, ...requests];
    await saveRequestsLocally(updated);
    await addAuditLog('إضافة رحلة', `رحلة إلى ${tripRegion} للسيارة ${userVehicle.plateNumber}`);
    setTripRegion('');
    setTripFrom('');
    setTripTo('');
    setTripNotes('');
    Alert.alert('تم', 'تم تسجيل الرحلة بنجاح');
  };

  /* =========================================================
     إدارة طلبات المسؤول
     ========================================================= */

  const updateRequestStatus = async (id: string, status: RequestStatus) => {
    const updated = requests.map(r => (r.id === id ? { ...r, status } : r));
    await saveRequestsLocally(updated);
    await addAuditLog('تحديث حالة طلب', `تم تغيير حالة الطلب ${id} إلى ${status}`);
  };

  /* =========================================================
     التكويدات: إضافة / تعديل / حذف (تعديل 2 + نقل التكويدات)
     ========================================================= */

  const addCodeItem = async (category: keyof CodeCategories, value: string) => {
    if (!value.trim()) return;
    const updated = { ...codes, [category]: [...codes[category], value.trim()] };
    await saveCodesLocally(updated);
    setNewCodeInput('');
    await addAuditLog('إضافة تكويد', `تمت إضافة "${value}" إلى ${category}`);
  };

  const startEditCodeItem = (oldValue: string) => {
    setEditingItemOldValue(oldValue);
    setEditingItemNewValue(oldValue);
  };

  const saveEditCodeItem = async (category: keyof CodeCategories) => {
    if (!editingItemOldValue) return;
    const updatedArr = codes[category].map(item =>
      item === editingItemOldValue ? editingItemNewValue.trim() : item
    );
    const updated = { ...codes, [category]: updatedArr };
    await saveCodesLocally(updated);

    // إذا كان للعنصر سعر مرتبط، انقل السعر إلى الاسم الجديد
    if (itemPrices[editingItemOldValue] !== undefined && editingItemNewValue !== editingItemOldValue) {
      const newPrices = { ...itemPrices };
      newPrices[editingItemNewValue] = newPrices[editingItemOldValue];
      delete newPrices[editingItemOldValue];
      await savePricesLocally(newPrices);
    }

    await addAuditLog('تعديل تكويد', `تم تعديل "${editingItemOldValue}" إلى "${editingItemNewValue}"`);
    setEditingItemOldValue(null);
    setEditingItemNewValue('');
  };

  const deleteCodeItem = async (category: keyof CodeCategories, value: string) => {
    const updated = { ...codes, [category]: codes[category].filter(v => v !== value) };
    await saveCodesLocally(updated);
    await addAuditLog('حذف تكويد', `تم حذف "${value}" من ${category}`);
  };

  /* =========================================================
     الأسعار: إضافة / تعديل
     ========================================================= */

  const setOrUpdatePrice = async (item: string, price: string) => {
    if (!item || !price) return;
    const updated = { ...itemPrices, [item]: price };
    await savePricesLocally(updated);
    await addAuditLog('تحديث سعر', `تم ضبط سعر "${item}" إلى ${price}`);
  };

  const startEditPrice = (key: string) => {
    setEditingPriceKey(key);
    setEditingPriceVal(itemPrices[key]);
  };

  const saveEditPrice = async () => {
    if (!editingPriceKey) return;
    await setOrUpdatePrice(editingPriceKey, editingPriceVal);
    setEditingPriceKey(null);
    setEditingPriceVal('');
  };

  /* =========================================================
     قائمة السيارات (تعديل: أيقونة قائمة السيارات في حساب المسؤول)
     تعرض اسم السيارة ورقمها فقط، وبقية البيانات فارغة
     ========================================================= */

  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');

  const addVehicle = async () => {
    if (!newVehicleName.trim() || !newVehiclePlate.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم السيارة ورقمها');
      return;
    }
    const newVehicle: Vehicle = {
      id: `v_${Date.now()}`,
      name: newVehicleName.trim(),
      plateNumber: newVehiclePlate.trim(),
      driverName: 'غير محدد',
      status: 'في الخدمة'
    };
    const updated = [...allVehicles, newVehicle];
    await saveVehiclesLocally(updated);
    setNewVehicleName('');
    setNewVehiclePlate('');
    await addAuditLog('إضافة سيارة', `تمت إضافة السيارة ${newVehicle.name} - ${newVehicle.plateNumber}`);
  };

  /* =========================================================
     قائمة السائقين
     ========================================================= */

  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverUsername, setNewDriverUsername] = useState('');

  const addDriver = async () => {
    if (!newDriverName.trim() || !newDriverUsername.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم السائق واسم المستخدم');
      return;
    }
    const newDriver: DriverUser = {
      id: `d_${Date.now()}`,
      name: newDriverName.trim(),
      username: newDriverUsername.trim(),
      password: '000'
    };
    const updated = [...drivers, newDriver];
    await saveDriversLocally(updated);
    setNewDriverName('');
    setNewDriverUsername('');
    await addAuditLog('إضافة سائق', `تمت إضافة السائق ${newDriver.name}`);
  };

  /* =========================================================
     ربط السيارات بالسائقين
     ========================================================= */

  const addVehicleDriverLink = async () => {
    if (!linkVehicleSelect || !linkDriverSelect || !linkFromDate.trim() || !linkToDate.trim()) {
      Alert.alert('تنبيه', 'الرجاء اختيار السيارة والسائق وتحديد فترة الربط');
      return;
    }
    const newLink: VehicleDriverLink = {
      id: `LNK-${Date.now()}`,
      vehicleId: linkVehicleSelect,
      driverId: linkDriverSelect,
      fromDate: linkFromDate,
      toDate: linkToDate
    };
    const updated = [...vehicleDriverLinks, newLink];
    await saveLinksLocally(updated);

    // تحديث اسم السائق في بيانات السيارة
    const driver = drivers.find(d => d.id === linkDriverSelect);
    if (driver) {
      const updatedVehicles = allVehicles.map(v =>
        v.id === linkVehicleSelect ? { ...v, driverName: driver.name } : v
      );
      await saveVehiclesLocally(updatedVehicles);
    }

    setLinkVehicleSelect('');
    setLinkDriverSelect('');
    setLinkFromDate('');
    setLinkToDate('');
    await addAuditLog('ربط سيارة بسائق', `تم ربط السيارة بالسائق من ${linkFromDate} إلى ${linkToDate}`);
    Alert.alert('تم', 'تم ربط السيارة بالسائق بنجاح');
  };

  /* =========================================================
     الصلاحيات: منح / سحب
     ========================================================= */

  const togglePermission = async (userId: string, key: keyof Omit<UserPermissions, 'userId'>) => {
    const current = getUserPermissions(userId);
    const updatedPerm: UserPermissions = { ...current, [key]: !current[key] };
    const others = permissions.filter(p => p.userId !== userId);
    const updated = [...others, updatedPerm];
    await savePermissionsLocally(updated);
  };

  /* =========================================================
     إعدادات المستخدم: تغيير كلمة المرور / تعديل بيانات السيارة
     (تعديل 6 + تعديل 7)
     ========================================================= */

  const handleChangeUserPassword = async () => {
    const myPerm = getUserPermissions(currentDriverId);
    if (!myPerm.canChangePassword) {
      Alert.alert('غير مسموح', 'لا تملك صلاحية تغيير كلمة المرور');
      return;
    }
    const driver = drivers.find(d => d.id === currentDriverId);
    if (!driver || driver.password !== settingOldPass) {
      Alert.alert('خطأ', 'كلمة المرور الحالية غير صحيحة');
      return;
    }
    if (!settingNewPass.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال كلمة مرور جديدة');
      return;
    }
    const updated = drivers.map(d =>
      d.id === currentDriverId ? { ...d, password: settingNewPass } : d
    );
    await saveDriversLocally(updated);
    setSettingOldPass('');
    setSettingNewPass('');
    Alert.alert('تم', 'تم تغيير كلمة المرور بنجاح');
  };

  const handleUpdateVehicleData = async () => {
    if (!settingPlateInput.trim() && !settingNameInput.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال البيانات المراد تعديلها');
      return;
    }
    const updatedVehicle: Vehicle = {
      ...userVehicle,
      plateNumber: settingPlateInput.trim() || userVehicle.plateNumber,
      name: settingNameInput.trim() || userVehicle.name
    };
    const updatedList = allVehicles.map(v => (v.id === userVehicle.id ? updatedVehicle : v));
    await saveVehiclesLocally(updatedList);
    setUserVehicle(updatedVehicle);
    setSettingPlateInput('');
    setSettingNameInput('');
    Alert.alert('تم', 'تم تحديث بيانات السيارة');
  };

  /* =========================================================
     المزامنة
     ========================================================= */

  const handleSync = async () => {
    setSyncLoading(true);
    setSyncMessage('جاري المزامنة...');
    try {
      const response = await fetch(SYNC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests, vehicles: allVehicles })
      });
      if (response.ok) {
        const now = new Date().toLocaleString('ar-YE');
        setLastSyncDate(now);
        await AsyncStorage.setItem('@fleet_last_sync', now);
        setSyncMessage('تمت المزامنة بنجاح');
      } else {
        setSyncMessage('فشلت المزامنة، حاول لاحقاً');
      }
    } catch (e) {
      setSyncMessage('تعذر الاتصال بالخادم');
    } finally {
      setSyncLoading(false);
    }
  };

  /* =========================================================
     مساعدات التقارير
     ========================================================= */

  const isWithinRange = (dateStr: string): boolean => {
    if (!reportFromDate && !reportToDate) return true;
    // مقارنة بسيطة نصياً على شكل السلسلة (يفضل إدخال التاريخ بصيغة موحدة)
    if (reportFromDate && dateStr < reportFromDate) return false;
    if (reportToDate && dateStr > reportToDate) return false;
    return true;
  };

  const getRequestsByType = (type: RequestType, scopeAllVehicles: boolean) => {
    return requests.filter(r => {
      if (r.type !== type) return false;
      if (!scopeAllVehicles && r.vehicleId !== userVehicle.id) return false;
      return isWithinRange(r.date);
    });
  };

  const sumAmount = (list: ServiceRequest[]) =>
    list.reduce((acc, r) => acc + (parseFloat(r.priceAmount || '0') || 0), 0);

  /* =========================================================
     شاشة تسجيل الدخول
     ========================================================= */

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loginContainer}>
          <View style={styles.loginLogoCircle}>
            <Text style={styles.loginLogoText}>🚚</Text>
          </View>
          <Text style={styles.loginBrand}>ميثاق</Text>
          <Text style={styles.loginSubtitle}>تسجيل الدخول لإدارة الأسطول</Text>

          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="اسم المستخدم (رقم السيارة)"
              value={loginUsername}
              onChangeText={setLoginUsername}
            />
            <TextInput
              style={styles.input}
              placeholder="كلمة المرور"
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
              <Text style={styles.primaryButtonText}>دخول</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.versionText}>{APP_VERSION_DISPLAY}</Text>
        </View>
      </SafeAreaView>
    );
  }

  /* =========================================================
     شاشة المسؤول
     ========================================================= */

  if (currentUserRole === 'admin') {
    const adminIcons: { key: string; label: string }[] = [
      { key: 'overview', label: 'نظرة عامة' },
      { key: 'requests', label: 'الطلبات' },
      { key: 'vehicles', label: 'قائمة السيارات' },
      { key: 'drivers', label: 'قائمة السائقين' },
      { key: 'link', label: 'ربط السيارات بسائقين' },
      { key: 'coding', label: 'التكويدات' },
      { key: 'permissions', label: 'الصلاحيات' },
      { key: 'logs', label: 'سجل العمليات' },
      { key: 'sync', label: 'المزامنة' }
    ];

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.headerLogo}>🅜</Text>
          <Text style={styles.headerTitle}>لوحة تحكم المسؤول</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>خروج</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
          {adminIcons.map(icon => (
            <TouchableOpacity
              key={icon.key}
              style={[styles.tabButton, adminSubTab === icon.key && styles.tabButtonActive]}
              onPress={() => setAdminSubTab(icon.key)}
            >
              <View style={[styles.tabIconCircle, { backgroundColor: TAB_COLORS[icon.key] || COLOR_PRIMARY }]}>
                <Text style={styles.tabIconText}>{ADMIN_TAB_ICONS[icon.key]}</Text>
              </View>
              <Text style={[styles.tabText, adminSubTab === icon.key && styles.tabTextActive]}>
                {icon.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={styles.content}>
          {/* نظرة عامة */}
          {adminSubTab === 'overview' && (
            <View>
              <Text style={styles.sectionTitle}>ملخص</Text>
              <Text style={styles.infoLine}>عدد السيارات: {allVehicles.length}</Text>
              <Text style={styles.infoLine}>عدد السائقين: {drivers.length}</Text>
              <Text style={styles.infoLine}>عدد الطلبات: {requests.length}</Text>
              <Text style={styles.infoLine}>
                طلبات قيد المراجعة: {requests.filter(r => r.status === 'قيد المراجعة').length}
              </Text>
            </View>
          )}

          {/* إدارة الطلبات */}
          {adminSubTab === 'requests' && (
            <View>
              <Text style={styles.sectionTitle}>إدارة الطلبات</Text>
              <TextInput
                style={styles.input}
                placeholder="بحث برقم اللوحة أو اسم السائق"
                value={adminSearch}
                onChangeText={setAdminSearch}
              />
              {requests
                .filter(r => adminRequestFilter === 'الكل' || r.status === adminRequestFilter)
                .filter(r => adminRequestTypeFilter === 'الكل' || r.type === adminRequestTypeFilter)
                .filter(
                  r =>
                    !adminSearch ||
                    r.vehiclePlate.includes(adminSearch) ||
                    r.driverName.includes(adminSearch)
                )
                .map(r => (
                  <View key={r.id} style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {r.type} - {r.vehiclePlate} - {r.driverName}
                    </Text>
                    <Text style={styles.cardLine}>التاريخ: {r.date}</Text>
                    <Text style={styles.cardLine}>رقم العملية: {r.processNumber}</Text>
                    <Text style={styles.cardLine}>الكمية: {r.quantity}</Text>
                    {!!r.priceAmount && <Text style={styles.cardLine}>الإجمالي: {r.priceAmount}</Text>}
                    <Text style={styles.cardLine}>الحالة: {r.status}</Text>
                    <View style={styles.rowButtons}>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => updateRequestStatus(r.id, 'تم الاعتماد')}
                      >
                        <Text style={styles.smallButtonText}>اعتماد</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectButton}
                        onPress={() => updateRequestStatus(r.id, 'مرفوض')}
                      >
                        <Text style={styles.smallButtonText}>رفض</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
            </View>
          )}

          {/* قائمة السيارات */}
          {adminSubTab === 'vehicles' && (
            <View>
              <Text style={styles.sectionTitle}>قائمة السيارات</Text>
              <TextInput
                style={styles.input}
                placeholder="بحث باسم السيارة أو رقمها"
                value={adminVehicleSearch}
                onChangeText={setAdminVehicleSearch}
              />
              <View style={styles.card}>
                <Text style={styles.cardTitle}>إضافة سيارة جديدة</Text>
                <TextInput
                  style={styles.input}
                  placeholder="اسم السيارة"
                  value={newVehicleName}
                  onChangeText={setNewVehicleName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="رقم السيارة"
                  value={newVehiclePlate}
                  onChangeText={setNewVehiclePlate}
                />
                <TouchableOpacity style={styles.primaryButton} onPress={addVehicle}>
                  <Text style={styles.primaryButtonText}>إضافة</Text>
                </TouchableOpacity>
              </View>

              {allVehicles
                .filter(
                  v =>
                    !adminVehicleSearch ||
                    v.name.includes(adminVehicleSearch) ||
                    v.plateNumber.includes(adminVehicleSearch)
                )
                .map(v => (
                  <View key={v.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{v.name}</Text>
                    <Text style={styles.cardLine}>رقم السيارة: {v.plateNumber}</Text>
                    <Text style={styles.cardLine}>السائق: {v.driverName}</Text>
                    <Text style={styles.cardLine}>الحالة: {v.status}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* قائمة السائقين */}
          {adminSubTab === 'drivers' && (
            <View>
              <Text style={styles.sectionTitle}>قائمة السائقين</Text>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>إضافة سائق جديد</Text>
                <TextInput
                  style={styles.input}
                  placeholder="اسم السائق"
                  value={newDriverName}
                  onChangeText={setNewDriverName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="اسم المستخدم لتسجيل الدخول"
                  value={newDriverUsername}
                  onChangeText={setNewDriverUsername}
                />
                <TouchableOpacity style={styles.primaryButton} onPress={addDriver}>
                  <Text style={styles.primaryButtonText}>إضافة</Text>
                </TouchableOpacity>
              </View>

              {drivers.map(d => (
                <View key={d.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{d.name}</Text>
                  <Text style={styles.cardLine}>اسم المستخدم: {d.username}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ربط السيارات بالسائقين */}
          {adminSubTab === 'link' && (
            <View>
              <Text style={styles.sectionTitle}>ربط السيارات بسائقين</Text>
              <View style={styles.card}>
                <Text style={styles.cardLine}>اختر السيارة:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {allVehicles.map(v => (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.chip,
                        linkVehicleSelect === v.id && styles.chipActive
                      ]}
                      onPress={() => setLinkVehicleSelect(v.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          linkVehicleSelect === v.id && styles.chipTextActive
                        ]}
                      >
                        {v.plateNumber}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.cardLine}>اختر السائق:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {drivers.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.chip,
                        linkDriverSelect === d.id && styles.chipActive
                      ]}
                      onPress={() => setLinkDriverSelect(d.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          linkDriverSelect === d.id && styles.chipTextActive
                        ]}
                      >
                        {d.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TextInput
                  style={styles.input}
                  placeholder="من تاريخ (مثال: 2026-01-01)"
                  value={linkFromDate}
                  onChangeText={setLinkFromDate}
                />
                <TextInput
                  style={styles.input}
                  placeholder="إلى تاريخ (مثال: 2026-06-01)"
                  value={linkToDate}
                  onChangeText={setLinkToDate}
                />
                <TouchableOpacity style={styles.primaryButton} onPress={addVehicleDriverLink}>
                  <Text style={styles.primaryButtonText}>ربط</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>سجل الربط</Text>
              {vehicleDriverLinks.map(l => {
                const v = allVehicles.find(x => x.id === l.vehicleId);
                const d = drivers.find(x => x.id === l.driverId);
                return (
                  <View key={l.id} style={styles.card}>
                    <Text style={styles.cardLine}>
                      {v?.plateNumber} ↔ {d?.name}
                    </Text>
                    <Text style={styles.cardLine}>
                      من {l.fromDate} إلى {l.toDate}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* التكويدات */}
          {adminSubTab === 'coding' && (
            <View>
              <Text style={styles.sectionTitle}>التكويدات</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
                {(
                  [
                    ['prices', 'الأسعار'],
                    ['fuelTypes', 'أنواع الوقود'],
                    ['oils', 'الزيوت'],
                    ['spareParts', 'قطع الغيار'],
                    ['batteries', 'البطاريات'],
                    ['tires', 'الإطارات'],
                    ['stations', 'المحطات'],
                    ['allocations', 'المخصصات'],
                    ['maintenanceTypes', 'أنواع الصيانة'],
                    ['punctureServices', 'خدمات البنشر'],
                    ['tripRegions', 'مناطق الرحلات']
                  ] as [keyof CodeCategories | 'prices', string][]
                ).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tabButton, codingSubTab === key && styles.tabButtonActive]}
                    onPress={() => setCodingSubTab(key)}
                  >
                    <Text style={[styles.tabText, codingSubTab === key && styles.tabTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {codingSubTab === 'prices' ? (
                <View>
                  <Text style={styles.cardTitle}>تعديل الأسعار</Text>
                  {Object.keys(itemPrices).map(key => (
                    <View key={key} style={styles.card}>
                      {editingPriceKey === key ? (
                        <View>
                          <Text style={styles.cardLine}>{key}</Text>
                          <TextInput
                            style={styles.input}
                            value={editingPriceVal}
                            onChangeText={setEditingPriceVal}
                            keyboardType="numeric"
                          />
                          <View style={styles.rowButtons}>
                            <TouchableOpacity style={styles.approveButton} onPress={saveEditPrice}>
                              <Text style={styles.smallButtonText}>حفظ</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectButton}
                              onPress={() => setEditingPriceKey(null)}
                            >
                              <Text style={styles.smallButtonText}>إلغاء</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.rowBetween}>
                          <Text style={styles.cardLine}>
                            {key}: {itemPrices[key]}
                          </Text>
                          <TouchableOpacity onPress={() => startEditPrice(key)}>
                            <Text style={styles.editText}>تعديل</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}

                  <Text style={styles.cardTitle}>إضافة / ضبط سعر لعنصر</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="اسم العنصر (مثال: ديزل)"
                    value={priceItemSelect}
                    onChangeText={setPriceItemSelect}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="السعر"
                    value={priceValueInput}
                    onChangeText={setPriceValueInput}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => {
                      setOrUpdatePrice(priceItemSelect, priceValueInput);
                      setPriceItemSelect('');
                      setPriceValueInput('');
                    }}
                  >
                    <Text style={styles.primaryButtonText}>حفظ السعر</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.cardTitle}>عناصر القائمة</Text>
                  {codes[codingSubTab as keyof CodeCategories].map(item => (
                    <View key={item} style={styles.card}>
                      {editingItemOldValue === item ? (
                        <View>
                          <TextInput
                            style={styles.input}
                            value={editingItemNewValue}
                            onChangeText={setEditingItemNewValue}
                          />
                          <View style={styles.rowButtons}>
                            <TouchableOpacity
                              style={styles.approveButton}
                              onPress={() => saveEditCodeItem(codingSubTab as keyof CodeCategories)}
                            >
                              <Text style={styles.smallButtonText}>حفظ</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectButton}
                              onPress={() => setEditingItemOldValue(null)}
                            >
                              <Text style={styles.smallButtonText}>إلغاء</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.rowBetween}>
                          <Text style={styles.cardLine}>{item}</Text>
                          <View style={styles.rowButtons}>
                            <TouchableOpacity onPress={() => startEditCodeItem(item)}>
                              <Text style={styles.editText}>تعديل</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                deleteCodeItem(codingSubTab as keyof CodeCategories, item)
                              }
                            >
                              <Text style={styles.deleteText}>حذف</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}

                  <TextInput
                    style={styles.input}
                    placeholder="إضافة عنصر جديد"
                    value={newCodeInput}
                    onChangeText={setNewCodeInput}
                  />
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => addCodeItem(codingSubTab as keyof CodeCategories, newCodeInput)}
                  >
                    <Text style={styles.primaryButtonText}>إضافة</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* الصلاحيات */}
          {adminSubTab === 'permissions' && (
            <View>
              <Text style={styles.sectionTitle}>الصلاحيات</Text>
              <Text style={styles.cardLine}>اختر المستخدم:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {drivers.map(d => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.chip,
                      permTargetUserId === d.id && styles.chipActive
                    ]}
                    onPress={() => setPermTargetUserId(d.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        permTargetUserId === d.id && styles.chipTextActive
                      ]}
                    >
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {permTargetUserId ? (
                <View style={styles.card}>
                  {(
                    [
                      ['canAddCodes', 'صلاحية إضافة تكويدات'],
                      ['canEditCodes', 'صلاحية تعديل تكويدات'],
                      ['canDeleteCodes', 'صلاحية حذف تكويدات'],
                      ['canEditPrices', 'صلاحية تعديل الأسعار'],
                      ['canChangePassword', 'صلاحية تغيير كلمة المرور']
                    ] as [keyof Omit<UserPermissions, 'userId'>, string][]
                  ).map(([key, label]) => {
                    const current = getUserPermissions(permTargetUserId);
                    return (
                      <View key={key} style={styles.rowBetween}>
                        <Text style={styles.cardLine}>{label}</Text>
                        <TouchableOpacity onPress={() => togglePermission(permTargetUserId, key)}>
                          <Text
                            style={current[key] ? styles.permOnText : styles.permOffText}
                          >
                            {current[key] ? 'ممنوحة' : 'غير ممنوحة'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.cardLine}>اختر مستخدماً لإدارة صلاحياته</Text>
              )}
            </View>
          )}

          {/* سجل العمليات */}
          {adminSubTab === 'logs' && (
            <View>
              <Text style={styles.sectionTitle}>سجل العمليات</Text>
              {auditLogs.map(log => (
                <View key={log.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{log.action}</Text>
                  <Text style={styles.cardLine}>{log.details}</Text>
                  <Text style={styles.cardLine}>
                    {log.user} - {log.date}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* المزامنة */}
          {adminSubTab === 'sync' && (
            <View>
              <Text style={styles.sectionTitle}>المزامنة</Text>
              <Text style={styles.cardLine}>{syncMessage}</Text>
              {!!lastSyncDate && (
                <Text style={styles.cardLine}>آخر مزامنة: {lastSyncDate}</Text>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={handleSync}>
                {syncLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>مزامنة الآن</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.versionText}>{APP_VERSION_DISPLAY}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* =========================================================
     شاشة المستخدم (السائق)
     ========================================================= */

  const userTabs = [
    { key: 'my_requests', label: 'طلباتي' },
    { key: 'trips', label: 'الرحلات' },
    { key: 'reports', label: 'التقارير' },
    { key: 'settings', label: 'الإعدادات' }
  ];

  const serviceTypes: RequestType[] = [
    'وقود',
    'زيوت',
    'إطارات',
    'بطاريات',
    'صيانة وقطع غيار',
    'بنشر'
  ];

  const myPerm = getUserPermissions(currentDriverId);

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'صباح الخير';
    if (hour < 17) return 'نهارك سعيد';
    return 'مساء الخير';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerLogo}>🅜</Text>
        <Text style={styles.headerTitle}>الرئيسية</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>خروج</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.greetingCard}>
        <View style={styles.greetingIconCircle}>
          <Text style={styles.greetingIconText}>👋</Text>
        </View>
        <View>
          <Text style={styles.greetingTitle}>{getGreeting()}</Text>
          <Text style={styles.greetingName}>
            {userVehicle.driverName} - {userVehicle.plateNumber}
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        {userTabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabButton, currentTab === t.key && styles.tabButtonActive]}
            onPress={() => setCurrentTab(t.key)}
          >
            <View style={[styles.tabIconCircle, { backgroundColor: TAB_COLORS[t.key] || COLOR_PRIMARY }]}>
              <Text style={styles.tabIconText}>{USER_TAB_ICONS[t.key]}</Text>
            </View>
            <Text style={[styles.tabText, currentTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content}>
        {/* طلباتي */}
        {currentTab === 'my_requests' && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
              {serviceTypes.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tabButton, serviceSubTab === t && styles.tabButtonActive]}
                  onPress={() => setServiceSubTab(t)}
                >
                  <View style={[styles.tabIconCircle, { backgroundColor: TAB_COLORS[t] || COLOR_PRIMARY }]}>
                    <Text style={styles.tabIconText}>{SERVICE_ICONS[t]}</Text>
                  </View>
                  <Text style={[styles.tabText, serviceSubTab === t && styles.tabTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="رقم العملية"
                value={reqProcessNo}
                onChangeText={setReqProcessNo}
              />

              {serviceSubTab === 'وقود' && (
                <View>
                  <Text style={styles.cardLine}>نوع الوقود:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.fuelTypes.map(f => (
                      <TouchableOpacity
                        key={f}
                        style={[styles.chip, reqFuelType === f && styles.chipActive]}
                        onPress={() => setReqFuelType(f)}
                      >
                        <Text style={[styles.chipText, reqFuelType === f && styles.chipTextActive]}>
                          {f}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.cardLine}>المحطة:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.stations.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.chip, reqStation === s && styles.chipActive]}
                        onPress={() => setReqStation(s)}
                      >
                        <Text style={[styles.chipText, reqStation === s && styles.chipTextActive]}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {serviceSubTab === 'زيوت' && (
                <View>
                  <Text style={styles.cardLine}>نوع الزيت:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.oils.map(o => (
                      <TouchableOpacity
                        key={o}
                        style={[styles.chip, reqOilType === o && styles.chipActive]}
                        onPress={() => setReqOilType(o)}
                      >
                        <Text style={[styles.chipText, reqOilType === o && styles.chipTextActive]}>
                          {o}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.input}
                    placeholder="العداد السابق"
                    value={reqPrevOdometer}
                    onChangeText={setReqPrevOdometer}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="العداد الحالي"
                    value={reqCurrentOdometer}
                    onChangeText={setReqCurrentOdometer}
                    keyboardType="numeric"
                  />
                  <Text style={styles.cardLine}>المسافة المقطوعة: {reqDistanceTraveled}</Text>
                </View>
              )}

              {serviceSubTab === 'إطارات' && (
                <View>
                  <Text style={styles.cardLine}>نوع الإطار:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.tires.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.chip, reqAllocation === t && styles.chipActive]}
                        onPress={() => setReqAllocation(t)}
                      >
                        <Text style={[styles.chipText, reqAllocation === t && styles.chipTextActive]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.cardLine}>نوع الخدمة:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.punctureServices.map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.chip, reqStation === p && styles.chipActive]}
                        onPress={() => setReqStation(p)}
                      >
                        <Text style={[styles.chipText, reqStation === p && styles.chipTextActive]}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {serviceSubTab === 'بطاريات' && (
                <View>
                  <Text style={styles.cardLine}>نوع البطارية:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.batteries.map(b => (
                      <TouchableOpacity
                        key={b}
                        style={[styles.chip, reqAllocation === b && styles.chipActive]}
                        onPress={() => setReqAllocation(b)}
                      >
                        <Text style={[styles.chipText, reqAllocation === b && styles.chipTextActive]}>
                          {b}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {serviceSubTab === 'صيانة وقطع غيار' && (
                <View>
                  <Text style={styles.cardLine}>نوع الصيانة:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.maintenanceTypes.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.chip, reqAllocation === m && styles.chipActive]}
                        onPress={() => setReqAllocation(m)}
                      >
                        <Text style={[styles.chipText, reqAllocation === m && styles.chipTextActive]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.cardLine}>القطعة (اختياري):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.spareParts.map(sp => (
                      <TouchableOpacity
                        key={sp}
                        style={[styles.chip, reqStation === sp && styles.chipActive]}
                        onPress={() => setReqStation(sp)}
                      >
                        <Text style={[styles.chipText, reqStation === sp && styles.chipTextActive]}>
                          {sp}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {serviceSubTab === 'بنشر' && (
                <View>
                  <Text style={styles.cardLine}>نوع الخدمة:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {codes.punctureServices.map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[styles.chip, reqAllocation === p && styles.chipActive]}
                        onPress={() => setReqAllocation(p)}
                      >
                        <Text style={[styles.chipText, reqAllocation === p && styles.chipTextActive]}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder="الكمية"
                value={reqQuantity}
                onChangeText={handleQuantityChange}
                keyboardType="numeric"
              />

              <Text style={styles.cardLine}>القيمة الإجمالية: {reqPriceAmount || '0'}</Text>

              <TouchableOpacity style={styles.attachButton} onPress={openAttachmentOptions}>
                <Text style={styles.attachButtonText}>
                  {reqAttachmentUri ? 'تم إرفاق صورة ✓' : 'إرفاق صورة'}
                </Text>
              </TouchableOpacity>

              {reqAttachmentUri && (
                <Image source={{ uri: reqAttachmentUri }} style={styles.attachmentPreview} />
              )}

              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="ملاحظات"
                value={reqNotes}
                onChangeText={setReqNotes}
                multiline
              />

              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmitRequest}>
                <Text style={styles.primaryButtonText}>إرسال الطلب</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>سجل طلباتي</Text>
            {requests
              .filter(r => r.vehicleId === userVehicle.id && r.type === serviceSubTab)
              .map(r => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.cardLine}>التاريخ: {r.date}</Text>
                  <Text style={styles.cardLine}>رقم العملية: {r.processNumber}</Text>
                  <Text style={styles.cardLine}>الكمية: {r.quantity}</Text>
                  {!!r.priceAmount && <Text style={styles.cardLine}>الإجمالي: {r.priceAmount}</Text>}
                  <Text style={styles.cardLine}>الحالة: {r.status}</Text>
                </View>
              ))}
          </View>
        )}

        {/* الرحلات (تعديل 8) */}
        {currentTab === 'trips' && (
          <View>
            <Text style={styles.sectionTitle}>تسجيل رحلة</Text>
            <View style={styles.card}>
              <Text style={styles.cardLine}>المنطقة:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {codes.tripRegions.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, tripRegion === r && styles.chipActive]}
                    onPress={() => setTripRegion(r)}
                  >
                    <Text style={[styles.chipText, tripRegion === r && styles.chipTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={styles.input}
                placeholder="تاريخ بداية الرحلة"
                value={tripFrom}
                onChangeText={setTripFrom}
              />
              <TextInput
                style={styles.input}
                placeholder="تاريخ نهاية الرحلة"
                value={tripTo}
                onChangeText={setTripTo}
              />
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="ملاحظات"
                value={tripNotes}
                onChangeText={setTripNotes}
                multiline
              />
              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmitTrip}>
                <Text style={styles.primaryButtonText}>تسجيل الرحلة</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>سجل رحلاتي</Text>
            {requests
              .filter(r => r.vehicleId === userVehicle.id && r.type === 'رحلة')
              .map(r => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.cardLine}>المنطقة: {r.tripRegion}</Text>
                  <Text style={styles.cardLine}>من: {r.tripFrom} إلى: {r.tripTo}</Text>
                  <Text style={styles.cardLine}>الحالة: {r.status}</Text>
                </View>
              ))}
          </View>
        )}

        {/* التقارير (تعديل 7) */}
        {currentTab === 'reports' && (
          <View>
            <View style={styles.rowButtons}>
              <TouchableOpacity
                style={[styles.tabButton, reportsMainTab === 'detailed' && styles.tabButtonActive]}
                onPress={() => setReportsMainTab('detailed')}
              >
                <Text
                  style={[styles.tabText, reportsMainTab === 'detailed' && styles.tabTextActive]}
                >
                  تقارير تفصيلية
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, reportsMainTab === 'summary' && styles.tabButtonActive]}
                onPress={() => setReportsMainTab('summary')}
              >
                <Text
                  style={[styles.tabText, reportsMainTab === 'summary' && styles.tabTextActive]}
                >
                  تقارير إجمالية
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="من تاريخ"
              value={reportFromDate}
              onChangeText={setReportFromDate}
            />
            <TextInput
              style={styles.input}
              placeholder="إلى تاريخ"
              value={reportToDate}
              onChangeText={setReportToDate}
            />

            {reportsMainTab === 'detailed' ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
                  {(
                    ['وقود', 'زيوت', 'صيانة وقطع غيار', 'إطارات', 'بطاريات', 'رحلة'] as RequestType[]
                  ).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tabButton, detailedCategory === t && styles.tabButtonActive]}
                      onPress={() => setDetailedCategory(t)}
                    >
                      <Text
                        style={[styles.tabText, detailedCategory === t && styles.tabTextActive]}
                      >
                        تقارير {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {getRequestsByType(detailedCategory, false).map(r => (
                  <View key={r.id} style={styles.card}>
                    <Text style={styles.cardLine}>التاريخ: {r.date}</Text>
                    <Text style={styles.cardLine}>رقم العملية: {r.processNumber}</Text>
                    {!!r.station && <Text style={styles.cardLine}>المحطة: {r.station}</Text>}
                    <Text style={styles.cardLine}>الكمية المخصصة: {r.quantity}</Text>
                    {!!r.priceAmount && (
                      <Text style={styles.cardLine}>الإجمالي: {r.priceAmount}</Text>
                    )}
                    {!!r.notes && <Text style={styles.cardLine}>ملاحظات: {r.notes}</Text>}
                  </View>
                ))}
              </View>
            ) : (
              <View>
                <Text style={styles.sectionTitle}>التقرير الإجمالي</Text>
                {(
                  ['وقود', 'صيانة وقطع غيار', 'إطارات', 'بطاريات'] as RequestType[]
                ).map(t => {
                  const list = getRequestsByType(t, false);
                  return (
                    <View key={t} style={styles.card}>
                      <Text style={styles.cardLine}>
                        {t}: {sumAmount(list)}
                      </Text>
                    </View>
                  );
                })}
                <View style={styles.card}>
                  <Text style={styles.cardTitleBold}>
                    الإجمالي الكلي:{' '}
                    {(['وقود', 'صيانة وقطع غيار', 'إطارات', 'بطاريات'] as RequestType[]).reduce(
                      (acc, t) => acc + sumAmount(getRequestsByType(t, false)),
                      0
                    )}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* الإعدادات (تعديل 7) */}
        {currentTab === 'settings' && (
          <View>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>تغيير كلمة المرور</Text>
              <View style={styles.settingsIconCircle}>
                <Text style={styles.tabIconText}>🔒</Text>
              </View>
            </View>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور الحالية"
                value={settingOldPass}
                onChangeText={setSettingOldPass}
                secureTextEntry
              />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور الجديدة"
                value={settingNewPass}
                onChangeText={setSettingNewPass}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.primaryButton, !myPerm.canChangePassword && styles.disabledButton]}
                onPress={handleChangeUserPassword}
                disabled={!myPerm.canChangePassword}
              >
                <Text style={styles.primaryButtonText}>
                  {myPerm.canChangePassword ? 'تحديث كلمة المرور' : 'لا تملك صلاحية'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>تعديل بيانات السيارة</Text>
              <View style={styles.settingsIconCircle}>
                <Text style={styles.tabIconText}>✏️</Text>
              </View>
            </View>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder={`اسم السيارة الحالي: ${userVehicle.name}`}
                value={settingNameInput}
                onChangeText={setSettingNameInput}
              />
              <TextInput
                style={styles.input}
                placeholder={`رقم السيارة الحالي: ${userVehicle.plateNumber}`}
                value={settingPlateInput}
                onChangeText={setSettingPlateInput}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={handleUpdateVehicleData}>
                <Text style={styles.primaryButtonText}>حفظ التعديلات</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButtonFull} onPress={handleLogout}>
              <Text style={styles.primaryButtonText}>تسجيل الخروج</Text>
            </TouchableOpacity>

            <Text style={styles.versionText}>{APP_VERSION_DISPLAY}</Text>
          </View>
        )}
      </ScrollView>

      {/* نافذة اختيار مصدر الصورة */}
      <Modal
        visible={attachmentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachmentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.sectionTitle}>إرفاق صورة</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={pickFromCamera}>
              <Text style={styles.primaryButtonText}>التقاط صورة بالكاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={pickFromGallery}>
              <Text style={styles.primaryButtonText}>اختيار من المعرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => setAttachmentModalVisible(false)}
            >
              <Text style={styles.smallButtonText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   الأنماط
   ========================================================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOR_BG },
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  loginLogoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF1ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  loginLogoText: { fontSize: 30 },
  loginBrand: { color: COLOR_PRIMARY, fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  loginSubtitle: { color: '#888', fontSize: 13, marginBottom: 18 },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECF3',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }
  },
  headerLogo: { fontSize: 20, color: COLOR_PRIMARY },
  headerTitle: { color: '#1a1a1a', fontSize: 16, fontWeight: 'bold' },
  logoutText: { color: COLOR_PRIMARY, fontSize: 14, fontWeight: 'bold' },
  greetingCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F1F5',
    borderRadius: 14,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 14
  },
  greetingIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12
  },
  greetingIconText: { fontSize: 18 },
  greetingTitle: { color: COLOR_PRIMARY, fontSize: 17, fontWeight: 'bold', textAlign: 'right' },
  greetingName: { color: '#222', fontSize: 14, fontWeight: 'bold', textAlign: 'right', marginTop: 2 },
  tabsRow: { flexDirection: 'row-reverse', paddingVertical: 7, paddingHorizontal: 7, backgroundColor: COLOR_BG },
  tabButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginHorizontal: 3,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E7F0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }
  },
  tabButtonActive: { backgroundColor: COLOR_PRIMARY, borderColor: COLOR_PRIMARY },
  tabIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLOR_PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabIconText: { fontSize: 11, color: '#FFFFFF' },
  settingsIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDEAEA',
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabText: { color: '#263238', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 11, paddingTop: 5, paddingBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginVertical: 8, textAlign: 'right' },
  infoLine: { fontSize: 14, marginVertical: 2, textAlign: 'right' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginVertical: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#EDF0F5'
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', textAlign: 'right', marginBottom: 4 },
  cardTitleBold: { fontSize: 16, fontWeight: 'bold', textAlign: 'right' },
  cardLine: { fontSize: 13, color: '#444', textAlign: 'right', marginVertical: 2 },
  rowBetween: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  rowButtons: { flexDirection: 'row-reverse', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#D9DFEA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 6,
    textAlign: 'right',
    backgroundColor: '#fff'
  },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: COLOR_PRIMARY,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 6
  },
  primaryButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  disabledButton: { backgroundColor: '#A0A4B8' },
  attachButton: {
    backgroundColor: '#E1E4EE',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 6
  },
  attachButtonText: { color: COLOR_PRIMARY, fontWeight: 'bold' },
  attachmentPreview: { width: '100%', height: 160, borderRadius: 8, marginVertical: 6 },
  approveButton: {
    backgroundColor: '#2E9E5B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8
  },
  rejectButton: {
    backgroundColor: '#C0392B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8
  },
  smallButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#E1E4EE',
    marginHorizontal: 4,
    marginVertical: 4
  },
  chipActive: { backgroundColor: COLOR_PRIMARY },
  chipText: { color: '#333', fontSize: 12 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  editText: { color: COLOR_PRIMARY, fontWeight: 'bold', marginHorizontal: 6 },
  deleteText: { color: '#C0392B', fontWeight: 'bold', marginHorizontal: 6 },
  permOnText: { color: '#2E9E5B', fontWeight: 'bold' },
  permOffText: { color: '#C0392B', fontWeight: 'bold' },
  logoutButtonFull: {
    backgroundColor: '#C0392B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10
  },
  versionText: { textAlign: 'center', color: '#888', fontSize: 11, marginTop: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '85%'
  }
});
