/**
 * `system-online-sdk` — the shell, experimental. Applications over one
 * desktop: a window manager, a menu bar that shows the front application's
 * menus, a catalog of what is where, the stock Finder that shows it, the
 * fonts the site gives its system, and app files installed at runtime.
 * Plain modules over vintage-frames' elements: it registers no elements,
 * writes no styles and ships no art or fonts, and it reaches the kit only
 * through `vintage-frames`' root exports, so the page imports
 * `vintage-frames` first.
 *
 * Its API may change in any minor release while it is experimental.
 * docs/SHELL.md is the reference.
 */

export { createShell, defineApp } from './shell.js'
export type { AppContext, AppDefinition, CatalogSetup, KindDefinition, Shell, ShellOptions, SystemFonts } from './shell.js'
export type {
  Install,
  InstallOptions,
  InstallRefusal,
  InstallResult,
  InstalledApp,
  SkipReason,
  UninstallResult,
} from './installs.js'

export { createWindowManager, focusInto } from './windows.js'
export type {
  AdoptOptions,
  ArrangeGroup,
  BoxInput,
  CloseHandler,
  FocusHome,
  HomeBox,
  OpenOptions,
  PlacePolicy,
  Placed,
  WindowManager,
  WindowManagerOptions,
} from './windows.js'

export { finder, FINDER } from './finder.js'
export type {
  FinderAlert,
  FinderAlertHandler,
  FinderAlerts,
  FinderApi,
  FinderArt,
  FinderCommand,
  FinderCommandSpec,
  FinderFailedAction,
  FinderMenu,
  FinderOpen,
  FinderOptions,
  UnavailableReason,
} from './finder.js'

export { fileByDrag } from './filing.js'
export type { FilingOptions } from './filing.js'

export {
  createCatalog,
  memoryStorage,
  aliasName,
  appIdOf,
  appleMenuItemsOf,
  appleMenuOf,
  canAlias,
  childrenOf,
  containerOf,
  copyName,
  descendantsOf,
  dropTargetOf,
  enclosingFolders,
  fontFamilyOf,
  isContainerKind,
  isInside,
  isKept,
  isTrashed,
  isVolume,
  itemCount,
  itemOf,
  nextFolderName,
  originalOf,
  resolve,
  startupItemsOf,
  ALIAS_KIND,
  APPLE_MENU_ITEMS,
  APP_KIND,
  DISK,
  FOLDER,
  FONTS,
  FONT_KIND,
  STARTUP_ITEMS,
  SYSTEM_FOLDER,
  TRASH,
  UNTITLED_FOLDER,
} from './catalog.js'
export type {
  AppleMenuEntry,
  Catalog,
  CatalogArchive,
  CatalogOptions,
  CatalogState,
  CatalogStorage,
  DropTarget,
  Item,
  KindHooks,
  NewItem,
  SystemFolders,
  Volumes,
} from './catalog.js'
export { indexedDbStorage } from './storage.js'

export { installedFamiliesOf } from './fonts.js'
export type { FontFamily, FontStrike } from './fonts.js'

export { localStorageState, mergeSession, openWindowsOf, readSession } from './state.js'
export type { LocalStorageStateOptions, SavedSession, SavedWindow, SessionSnapshot, ShellState } from './state.js'

export {
  BAND,
  CASCADE_SLOTS,
  CASCADE_STEP,
  ICON_CELL,
  ICON_COLUMN,
  ICON_INSET,
  ICON_ROW,
  NEAR,
  WINDOW_ORIGIN,
  cascadedBox,
  cascadeFrom,
  cascadeSlot,
  centeredBox,
  cleanUp,
  collisions,
  desktopLattice,
  fieldExtent,
  fillOrder,
  folderLattice,
  frameOf,
  freeCellNear,
  isPin,
  latticeCell,
  latticeSlot,
  nearBox,
  nextFreeCell,
  pinOf,
  pinTo,
  trashCell,
  windowOrigin,
} from './geometry.js'
export type {
  Bands,
  Box,
  CascadeOptions,
  EdgePin,
  Frame,
  Lattice,
  LatticeOptions,
  Pin,
  Point,
  Policy,
  Size,
} from './geometry.js'

export { startClock, formatDate, formatTime, DATE_HOLD_MS } from './clock.js'

export {
  APP_API,
  APP_API_OLDEST,
  APP_FILE_FORMAT,
  BOX_SCALE,
  appRuns,
  checkSignature,
  compareVersions,
  inspectAppFile,
  judgeSignature,
  readAppFile,
  satisfies,
} from './app-file.js'
export type { AppFile, AppManifest, SignatureCheck, Standing, Trust, TrustAnswer } from './app-file.js'
export { VERSION } from './version.js'
