import { useQuery,useMutation,useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { engineWorkspaceApi,defaultEnginePreferences,type EnginePreferences } from "@/api/engineWorkspaceApi";
export function useEnginePreferences(){
  const {user}=useAuth(),{profile}=useProfile(),client=useQueryClient();
  const enabled=!!user&&profile?.subscription_plan === "premium_plus";
  const queryKey=["continua","engine-preferences",user?.id];
  const query=useQuery({queryKey,queryFn:engineWorkspaceApi.preferences,enabled,staleTime:60000,retry:false});
  const save=useMutation({mutationFn:(settings:EnginePreferences)=>engineWorkspaceApi.savePreferences(settings),onSuccess:settings=>client.setQueryData(queryKey,settings)});
  return {settings:query.data??defaultEnginePreferences,query,save,enabled};
}
