export {
	ensure,
	getCurrentAuthUser,
	getByExternalId,
	getByExternalIdInternal,
	getById,
} from "./userAuth";

// Re-export profile functions (getFavoriteModels, toggleFavoriteModel, setFavoriteModels, updateName)
export {
	getFavoriteModels,
	toggleFavoriteModel,
	setFavoriteModels,
	updateName,
} from "./userProfile";

export {
	saveOpenRouterKey,
	saveMyOpenRouterKeyPlaintext,
	getOpenRouterKey,
	hasOpenRouterKey,
	hasMyOpenRouterKey,
	getOpenRouterKeyInternal,
	removeOpenRouterKey,
	removeMyOpenRouterKey,
} from "./userApiKeys";

export {
	deleteUserStreamJobs,
	deleteUserMessages,
	deleteUserChats,
	deleteUserFiles,
	deleteUserChatReadStatuses,
	deleteUserPromptTemplates,
	deleteUserRecord,
	deleteAccountWorkflowStep,
	deleteAccount,
} from "./userDeletion";

export { incrementAiUsage } from "./userBilling";
