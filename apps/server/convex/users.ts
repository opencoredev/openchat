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
	getOpenRouterKey,
	hasOpenRouterKey,
	getOpenRouterKeyInternal,
	removeOpenRouterKey,
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
