extends Object
class_name SaveSystem

const SAVE_PATH := "user://gamewar_save.json"

static func load_profile() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return GameData.default_profile()

	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return GameData.default_profile()

	var text := file.get_as_text()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return GameData.default_profile()

	var profile: Dictionary = parsed
	if not profile.has("unlocked_upgrades"):
		profile["unlocked_upgrades"] = []
	if not profile.has("cleared_stages"):
		profile["cleared_stages"] = []
	if not profile.has("stage_index"):
		profile["stage_index"] = 1
	if not profile.has("highest_stage"):
		profile["highest_stage"] = 1
	if not profile.has("coins"):
		profile["coins"] = 10000
	if not profile.has("unlocked_features"):
		profile["unlocked_features"] = []
	if not profile.has("unlocked_supers"):
		profile["unlocked_supers"] = []
	if not profile.has("active_super"):
		profile["active_super"] = null
	if not profile.has("kills"):
		profile["kills"] = 0
	return profile

static func save_profile(profile: Dictionary) -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(profile))

static func reset_save() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		var path := ProjectSettings.globalize_path(SAVE_PATH)
		DirAccess.remove_absolute(path)
