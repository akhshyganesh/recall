# recall-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _recall_user_zdotdir="${RECALL_USER_ZDOTDIR:-$HOME}"
  [ -f "$_recall_user_zdotdir/.zprofile" ] && source "$_recall_user_zdotdir/.zprofile"
  unset _recall_user_zdotdir
}
:
