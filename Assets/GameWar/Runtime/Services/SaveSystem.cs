using System.IO;
using UnityEngine;

namespace GameWar
{
    public static class SaveSystem
    {
        private const string SaveFileName = "gamewar_save.json";

        public static string SavePath
        {
            get { return Path.Combine(Application.persistentDataPath, SaveFileName); }
        }

        public static SaveProfile LoadOrCreate()
        {
            if (!File.Exists(SavePath))
            {
                return new SaveProfile();
            }

            try
            {
                string json = File.ReadAllText(SavePath);
                SaveProfile profile = JsonUtility.FromJson<SaveProfile>(json);
                if (profile == null)
                {
                    return new SaveProfile();
                }

                if (profile.currentStageIndex < 1)
                {
                    profile.currentStageIndex = 1;
                }

                if (profile.highestStageIndex < profile.currentStageIndex)
                {
                    profile.highestStageIndex = profile.currentStageIndex;
                }

                if (profile.unlockedUpgradeIds == null)
                {
                    profile.unlockedUpgradeIds = new System.Collections.Generic.List<string>();
                }

                if (profile.clearedStageIds == null)
                {
                    profile.clearedStageIds = new System.Collections.Generic.List<string>();
                }

                return profile;
            }
            catch
            {
                return new SaveProfile();
            }
        }

        public static void Save(SaveProfile profile)
        {
            if (profile == null)
            {
                return;
            }

            string json = JsonUtility.ToJson(profile, true);
            File.WriteAllText(SavePath, json);
        }

        public static void Delete()
        {
            if (File.Exists(SavePath))
            {
                File.Delete(SavePath);
            }
        }
    }
}
